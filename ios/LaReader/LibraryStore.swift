import SwiftUI
import ReadiumShared

@MainActor final class LibraryStore: ObservableObject {
    @Published private(set) var books: [LibraryBook] = []
    @Published var settings = ReaderSettings() { didSet { saveSettings() } }
    @Published var error: String?
    @Published private(set) var importing = false
    @Published private(set) var importLabel = ""
    let root: URL
    private var writable = true
    private var pendingSave: Task<Void, Never>?
    private var index: URL { root.appendingPathComponent("library-v2.json") }

    init(root: URL? = nil) {
        self.root = root ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("LaReader", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: self.root, withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: index.path) {
                books = try JSONDecoder().decode([LibraryBook].self, from: Data(contentsOf: index))
                guard books.allSatisfy({ ReaderPolicy.validID($0.id) }) else { throw ReaderFailure("Chỉ mục thư viện bị lỗi.") }
            } else { try migrateLegacy() }
            if let data = UserDefaults.standard.data(forKey: "la.native.settings.v2") {
                settings = try JSONDecoder().decode(ReaderSettings.self, from: data)
            }
        } catch {
            writable = false
            self.error = "Không mở được thư viện. Dữ liệu gốc vẫn được giữ. \(error.localizedDescription)"
        }
    }

    func file(_ book: LibraryBook) -> URL { root.appendingPathComponent("\(book.id).\(book.format.rawValue)") }
    func cover(_ book: LibraryBook) -> URL { root.appendingPathComponent("\(book.id).jpg") }
    func book(_ id: String) -> LibraryBook? { books.first { $0.id == id } }

    func importBooks(_ urls: [URL]) async {
        guard writable, !importing else { return }
        importing = true
        defer { importing = false; importLabel = "" }
        var failures: [String] = []
        for url in urls {
            importLabel = url.lastPathComponent
            let accessed = url.startAccessingSecurityScopedResource()
            defer { if accessed { url.stopAccessingSecurityScopedResource() } }
            do { try await importBook(url) }
            catch { failures.append("\(url.lastPathComponent): \(error.localizedDescription)") }
        }
        if !failures.isEmpty { error = failures.joined(separator: "\n") }
    }

    private func importBook(_ source: URL) async throws {
        guard let format = BookFormat(rawValue: source.pathExtension.lowercased()) else { throw ReaderFailure("Chọn tệp EPUB hoặc CBZ.") }
        let staged = root.appendingPathComponent("import-\(UUID().uuidString).\(format.rawValue)")
        defer { try? FileManager.default.removeItem(at: staged) }
        let id = try await Task.detached(priority: .userInitiated) {
            var copyError: Error?
            let coordinator = NSFileCoordinator()
            coordinator.coordinate(readingItemAt: source, options: .withoutChanges, error: nil) { coordinated in
                do {
                    let size = try coordinated.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                    guard size <= ArchiveInspector.maximumFileSize else { throw ReaderFailure("Tệp phải nhỏ hơn 100 MB.") }
                    try FileManager.default.copyItem(at: coordinated, to: staged)
                } catch { copyError = error }
            }
            if let copyError { throw copyError }
            return try ArchiveInspector.inspect(staged)
        }.value
        guard !books.contains(where: { $0.id == id }) else { return }
        let publication = try await PublicationService.shared.open(staged)
        let title = publication.metadata.title?.isEmpty == false ? publication.metadata.title! : source.deletingPathExtension().lastPathComponent
        let author = publication.metadata.authors.map(\.name).joined(separator: ", ")
        let book = LibraryBook(id: id, title: title, author: author, format: format, filename: source.lastPathComponent)
        if let image = try? await publication.coverFitting(maxSize: CGSize(width: 400, height: 600)).get(),
           let data = image.jpegData(compressionQuality: 0.82) { try? data.write(to: cover(book), options: .atomic) }
        try FileManager.default.moveItem(at: staged, to: file(book))
        do { try persist(books + [book]); books.append(book) }
        catch { try? FileManager.default.removeItem(at: file(book)); throw error }
    }

    func updatePosition(_ id: String, locator: String?, page: Int?, progress: Double) {
        guard let i = books.firstIndex(where: { $0.id == id }) else { return }
        books[i].locator = locator
        if let page { books[i].comicPage = max(0, page) }
        books[i].progress = min(1, max(0, progress.isFinite ? progress : 0))
        books[i].lastReadAt = Date().timeIntervalSince1970
        pendingSave?.cancel()
        pendingSave = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(350))
            if !Task.isCancelled { self?.flush() }
        }
    }
    func toggleBookmark(_ id: String, bookmark: Bookmark) {
        guard let i = books.firstIndex(where: { $0.id == id }) else { return }
        if let j = books[i].bookmarks.firstIndex(where: { $0.locator == bookmark.locator && $0.page == bookmark.page }) {
            books[i].bookmarks.remove(at: j)
        } else { books[i].bookmarks.append(bookmark) }
        flush()
    }
    func removeBookmark(_ id: String, bookmarkID: String) {
        guard let i = books.firstIndex(where: { $0.id == id }) else { return }
        books[i].bookmarks.removeAll { $0.id == bookmarkID }; flush()
    }
    func delete(_ book: LibraryBook) {
        let remaining = books.filter { $0.id != book.id }
        do {
            try persist(remaining); books = remaining
            try? FileManager.default.removeItem(at: file(book)); try? FileManager.default.removeItem(at: cover(book))
        } catch { self.error = error.localizedDescription }
    }
    func flush() {
        pendingSave?.cancel()
        do { try persist(books) } catch { self.error = "Không lưu được tiến độ: \(error.localizedDescription)" }
    }
    private func persist(_ value: [LibraryBook]) throws {
        guard writable else { throw ReaderFailure("Thư viện đang ở chế độ bảo vệ dữ liệu.") }
        try JSONEncoder().encode(value).write(to: index, options: .atomic)
    }
    private func saveSettings() {
        guard let data = try? JSONEncoder().encode(settings) else { return }
        UserDefaults.standard.set(data, forKey: "la.native.settings.v2")
    }

    /// Capacitor v1 files and preferences remain intact until the native index commits.
    private func migrateLegacy() throws {
        guard let json = UserDefaults.standard.string(forKey: "CapacitorStorage.la.library.v1"),
              let data = json.data(using: .utf8),
              let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return }
        var migrated: [LibraryBook] = []
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let library = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
        for row in rows where row["demo"] as? Bool != true {
            guard let id = row["id"] as? String, ReaderPolicy.validID(id),
                  let raw = row["format"] as? String, let format = BookFormat(rawValue: raw) else { continue }
            var book = LibraryBook(id: id, title: row["title"] as? String ?? "Sách", author: row["author"] as? String ?? "", format: format, filename: row["filename"] as? String ?? "\(id).\(raw)")
            book.addedAt = (row["addedAt"] as? Double ?? 0) / 1000
            book.lastReadAt = (row["lastReadAt"] as? Double ?? 0) / 1000
            book.progress = min(1, max(0, row["progress"] as? Double ?? 0))
            if format == .cbz { book.comicPage = Int(row["location"] as? String ?? "") ?? 0 }
            for mark in row["bookmarks"] as? [[String: Any]] ?? [] {
                let location = mark["location"] as? String ?? ""
                let page = format == .cbz ? Int(location) : nil
                // Retain original EPUB CFIs in the migration backup; Readium uses locators.
                book.bookmarks.append(Bookmark(label: mark["label"] as? String ?? "Dấu trang cũ", locator: format == .epub ? location : nil, page: page, progress: book.progress))
            }
            let candidates = [documents, library.appendingPathComponent("NoCloud"), library.appendingPathComponent("Application Support")]
                .map { $0.appendingPathComponent("books/\(id).zip") }
            guard let old = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
                throw ReaderFailure("Thiếu tệp của \(book.title). Chưa thay đổi thư viện cũ.")
            }
            if !FileManager.default.fileExists(atPath: file(book).path) { try FileManager.default.copyItem(at: old, to: file(book)) }
            if let cover = row["cover"] as? String, let base64 = cover.split(separator: ",").last, let bytes = Data(base64Encoded: String(base64)) {
                try? bytes.write(to: self.cover(book), options: .atomic)
            }
            migrated.append(book)
        }
        try persist(migrated); books = migrated
    }
}
