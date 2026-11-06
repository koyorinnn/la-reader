import Foundation

enum BookFormat: String, Codable, CaseIterable { case epub, cbz }
enum ReaderTheme: String, Codable, CaseIterable {
    case paper, sepia, dark
    var title: String { switch self { case .paper: "Sáng"; case .sepia: "Giấy"; case .dark: "Tối" } }
}
enum PageMotion: String, Codable, CaseIterable {
    case curl, slide, none
    var title: String { switch self { case .curl: "Lật trang"; case .slide: "Trượt"; case .none: "Không" } }
}
struct ReaderSettings: Codable, Equatable {
    var theme: ReaderTheme = .paper
    var fontSize: Double = 19
    var lineHeight: Double = 1.7
    var epubDouble = true
    var comicDouble = false
    var rightToLeft = false
    var motion: PageMotion = .curl
}
struct Bookmark: Codable, Identifiable, Equatable {
    var id = UUID().uuidString
    var label: String
    var locator: String?
    var page: Int?
    var progress: Double
}
struct LibraryBook: Codable, Identifiable, Equatable {
    var id: String
    var title: String
    var author: String
    var format: BookFormat
    var filename: String
    var addedAt: Double = Date().timeIntervalSince1970
    var lastReadAt: Double = 0
    var progress: Double = 0
    var locator: String?
    var comicPage: Int = 0
    var bookmarks: [Bookmark] = []
}
enum ReaderPolicy {
    enum Tap: Equatable { case left, center, right }
    static func tap(x: Double, width: Double) -> Tap? {
        guard width > 0, x.isFinite, x >= 0, x <= width else { return nil }
        return x < width * 0.3 ? .left : x > width * 0.7 ? .right : .center
    }
    static func pages(width: Double, height: Double, double: Bool) -> Int {
        double && width > height && width >= 600 ? 2 : 1
    }
    static func spread(page: Int, count: Int, pages: Int) -> [Int] {
        guard count > 0 else { return [] }
        let size = max(1, min(2, pages)), safe = max(0, min(page, count - 1))
        let start = (safe / size) * size
        return Array(start..<min(count, start + size))
    }
    static func validID(_ id: String) -> Bool {
        id.count == 64 && id.allSatisfy { "0123456789abcdef".contains($0) }
    }
}
struct ReaderFailure: LocalizedError {
    var message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
