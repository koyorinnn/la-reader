import SwiftUI
import UniformTypeIdentifiers

private enum Shelf: String, CaseIterable, Identifiable {
    case all = "Thư viện", reading = "Đang đọc", finished = "Đã đọc", epub = "Sách", cbz = "Truyện tranh"
    var id: String { rawValue }
    var icon: String { switch self { case .all: "books.vertical"; case .reading: "book"; case .finished: "checkmark.circle"; case .epub: "text.book.closed"; case .cbz: "rectangle.on.rectangle" } }
    func includes(_ book: LibraryBook) -> Bool { switch self {
    case .all: true; case .reading: book.lastReadAt > 0 && book.progress < 0.99
    case .finished: book.progress >= 0.99; case .epub: book.format == .epub; case .cbz: book.format == .cbz
    } }
}

struct LibraryView: View {
    @EnvironmentObject private var library: LibraryStore
    @Environment(\.horizontalSizeClass) private var sizeClass
    @State private var shelf: Shelf? = .all
    @State private var search = ""
    @State private var importer = false
    @State private var selected: LibraryBook?
    @State private var deleting: LibraryBook?
    @State private var sortByTitle = false
    private var filtered: [LibraryBook] {
        library.books.filter { (shelf ?? .all).includes($0) && (search.isEmpty || ($0.title + " " + $0.author).localizedStandardContains(search)) }.sorted {
            sortByTitle ? $0.title.localizedStandardCompare($1.title) == .orderedAscending : max($0.lastReadAt, $0.addedAt) > max($1.lastReadAt, $1.addedAt)
        }
    }
    var body: some View {
        NavigationSplitView {
            List(Shelf.allCases, selection: $shelf) { item in Label(item.rawValue, systemImage: item.icon).tag(item) }
                .navigationTitle("Lá")
                .navigationSplitViewColumnWidth(min: 210, ideal: 240, max: 280)
                .safeAreaInset(edge: .bottom) {
                    Text("\(library.books.count) cuốn sách · Trên thiết bị").font(.footnote).foregroundStyle(.secondary).padding()
                }
        } detail: {
            NavigationStack {
                ScrollView {
                    if filtered.isEmpty {
                        if !search.isEmpty { ContentUnavailableView.search(text: search).padding(.top, 80) }
                        else if library.books.isEmpty {
                            ContentUnavailableView {
                                Label("Thư viện của bạn", systemImage: "books.vertical")
                            } description: { Text("Thêm sách EPUB hoặc truyện CBZ để bắt đầu đọc.") }
                            actions: { Button("Thêm sách", systemImage: "plus") { importer = true }.buttonStyle(.borderedProminent).controlSize(.large) }
                            .padding(.top, 100)
                        } else { ContentUnavailableView("Chưa có sách", systemImage: (shelf ?? .all).icon).padding(.top, 80) }
                    } else {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: sizeClass == .regular ? 155 : 130, maximum: 220), spacing: 24)], alignment: .leading, spacing: 30) {
                            ForEach(filtered) { book in
                                Button { selected = book } label: { BookCell(book: book, cover: library.cover(book)) }
                                    .buttonStyle(.plain).accessibilityIdentifier("book-\(book.format.rawValue)")
                                    .contextMenu {
                                        Button("Đọc sách", systemImage: "book") { selected = book }
                                        ShareLink(item: library.file(book)) { Label("Chia sẻ tệp", systemImage: "square.and.arrow.up") }
                                        Button("Xóa khỏi thư viện", systemImage: "trash", role: .destructive) { deleting = book }
                                    }
                            }
                        }.padding(.horizontal, sizeClass == .regular ? 36 : 22).padding(.vertical, 24)
                    }
                }
                .navigationTitle((shelf ?? .all).rawValue)
                .searchable(text: $search, prompt: "Tìm sách hoặc tác giả")
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Menu {
                            Picker("Hiển thị", selection: $shelf) { ForEach(Shelf.allCases) { item in Text(item.rawValue).tag(Optional(item)) } }
                            Divider()
                            Picker("Sắp xếp", selection: $sortByTitle) { Text("Gần đây").tag(false); Text("Tên sách").tag(true) }
                        } label: { Label("Hiển thị thư viện", systemImage: "line.3.horizontal.decrease") }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        Button { importer = true } label: { Label("Thêm sách", systemImage: "plus") }.disabled(library.importing)
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    if library.importing {
                        HStack(spacing: 12) { ProgressView(); Text("Đang nhập \(library.importLabel)").font(.callout).lineLimit(1) }.padding(16).readerGlass().padding()
                    }
                }
            }
        }
        .navigationSplitViewStyle(.balanced)
        .fileImporter(isPresented: $importer, allowedContentTypes: [UTType(filenameExtension: "epub") ?? .data, UTType(filenameExtension: "cbz") ?? .zip], allowsMultipleSelection: true) { result in
            switch result { case .success(let urls): Task { await library.importBooks(urls) }; case .failure(let error): library.error = error.localizedDescription }
        }
        .fullScreenCover(item: $selected) { book in ReaderView(book: book, store: library) }
        .alert("Không thể hoàn tất", isPresented: Binding(get: { library.error != nil }, set: { if !$0 { library.error = nil } })) {
            Button("Đóng") { library.error = nil }
        } message: { Text(library.error ?? "") }
        .confirmationDialog("Xóa “\(deleting?.title ?? "")” khỏi thiết bị?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
            Button("Xóa sách", role: .destructive) { if let book = deleting { library.delete(book) }; deleting = nil }
        }
    }
}

private struct BookCell: View {
    let book: LibraryBook, cover: URL
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 5).fill(Color(.secondarySystemGroupedBackground))
                if let image = UIImage(contentsOfFile: cover.path) { Image(uiImage: image).resizable().scaledToFit() }
                else {
                    VStack(spacing: 12) { Image(systemName: book.format == .epub ? "book.closed" : "rectangle.on.rectangle").font(.title); Text(book.title).font(.system(.headline, design: .serif)).multilineTextAlignment(.center).lineLimit(5) }.padding(18).foregroundStyle(.secondary)
                }
            }.aspectRatio(0.68, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 5))
                .shadow(color: .black.opacity(0.12), radius: 8, x: 0, y: 5)
            Text(book.title).font(.subheadline.weight(.medium)).foregroundStyle(.primary).lineLimit(2)
            Text(book.author.isEmpty ? book.format.rawValue.uppercased() : book.author).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            if book.lastReadAt > 0 {
                ProgressView(value: book.progress).tint(.secondary).accessibilityLabel("Đã đọc \(Int(book.progress*100)) phần trăm")
            }
        }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            .accessibilityElement(children: .combine)
    }
}
