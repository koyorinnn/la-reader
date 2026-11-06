import XCTest
@testable import LaReader

final class ReaderPolicyTests: XCTestCase {
    func testTapZonesScaleWithIPadAndPhone() {
        for width in [390.0, 600, 744, 834, 1024, 1194, 1366] {
            XCTAssertEqual(ReaderPolicy.tap(x: width*0.25, width: width), .left)
            XCTAssertEqual(ReaderPolicy.tap(x: width*0.5, width: width), .center)
            XCTAssertEqual(ReaderPolicy.tap(x: width*0.75, width: width), .right)
            XCTAssertNil(ReaderPolicy.tap(x: -1, width: width))
        }
    }
    func testSpreadsDoNotSkipOrDuplicatePages() {
        for count in 1...15 {
            let pages = stride(from: 0, to: count, by: 2).flatMap { ReaderPolicy.spread(page: $0, count: count, pages: 2) }
            XCTAssertEqual(pages, Array(0..<count))
            XCTAssertEqual(ReaderPolicy.spread(page: count+10, count: count, pages: 2).last, count-1)
        }
    }
    func testPortraitAndSmallWindowsUseOnePage() {
        XCTAssertEqual(ReaderPolicy.pages(width: 834, height: 1194, double: true), 1)
        XCTAssertEqual(ReaderPolicy.pages(width: 1194, height: 834, double: true), 2)
        XCTAssertEqual(ReaderPolicy.pages(width: 1194, height: 834, double: false), 1)
        XCTAssertEqual(ReaderPolicy.pages(width: 500, height: 400, double: true), 1)
    }
    func testMalformedZipRejected() {
        for data in [Data(), Data(repeating: 0, count: 100), Data("PK not an archive".utf8)] { XCTAssertThrowsError(try ArchiveInspector.validate(data)) }
    }
    func testIdentifiersCannotEscapeStorage() {
        XCTAssertTrue(ReaderPolicy.validID(String(repeating: "a", count: 64)))
        XCTAssertFalse(ReaderPolicy.validID("../../other"))
        XCTAssertFalse(ReaderPolicy.validID(String(repeating: "z", count: 64)))
    }
    @MainActor func testCorruptIndexIsNotOverwritten() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let index = root.appendingPathComponent("library-v2.json"), original = Data("corrupt".utf8)
        try original.write(to: index)
        let store = LibraryStore(root: root); store.flush()
        XCTAssertNotNil(store.error)
        XCTAssertEqual(try Data(contentsOf: index), original)
    }
}
