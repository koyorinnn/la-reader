import XCTest

final class ReaderUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    @MainActor override func tearDownWithError() throws {
        attach("Native reader final screen")
        let hierarchy = XCTAttachment(string: XCUIApplication().debugDescription)
        hierarchy.name = "Native reader hierarchy"; hierarchy.lifetime = .keepAlways; add(hierarchy)
    }
    @MainActor func testEPUBCenterSidesRotationAndSettings() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitest"]; app.launch()
        XCUIDevice.shared.orientation = .landscapeLeft
        let book = app.buttons["book-epub"].firstMatch
        XCTAssertTrue(book.waitForExistence(timeout: 30)); attach("Native library landscape"); book.tap()
        let hide = app.buttons["reader-hide"], progress = app.staticTexts["reader-progress"]
        XCTAssertTrue(hide.waitForExistence(timeout: 30))
        XCTAssertTrue(NSPredicate(format: "enabled == true").evaluate(with: hide) || waitEnabled(hide))
        app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(waitGone(hide))
        app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(hide.waitForExistence(timeout: 5))
        let before = progress.label
        app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.5)).tap()
        XCTAssertTrue(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", before), object: progress)], timeout: 10) == .completed)
        app.buttons["reader-settings"].tap()
        XCTAssertTrue(app.switches["reader-double"].waitForExistence(timeout: 5))
        attach("iPad native settings")
        app.buttons["Xong"].tap()
        attach("iPad native EPUB landscape")
        XCUIDevice.shared.orientation = .portrait
        XCTAssertTrue(hide.waitForExistence(timeout: 5))
        attach("iPad native EPUB portrait")
        app.buttons["reader-close"].tap()
    }
    @MainActor func testCBZNativePagingAndHiddenControls() throws {
        let app = XCUIApplication(); app.launchArguments = ["--uitest"]; app.launch()
        XCUIDevice.shared.orientation = .landscapeLeft
        let book = app.buttons["book-cbz"].firstMatch
        XCTAssertTrue(book.waitForExistence(timeout: 30)); book.tap()
        let hide = app.buttons["reader-hide"]
        XCTAssertTrue(hide.waitForExistence(timeout: 20)); XCTAssertTrue(waitEnabled(hide))
        app.buttons["reader-settings"].tap()
        let double = app.switches["reader-double"]
        XCTAssertTrue(double.waitForExistence(timeout: 5))
        if double.value as? String == "0" { double.tap() }
        app.buttons["Xong"].tap()
        let progress = app.staticTexts["reader-progress"]
        XCTAssertTrue(progress.waitForExistence(timeout: 5))
        XCTAssertTrue(waitLabel(progress, "1–2 / 5"))
        app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.5)).tap()
        XCTAssertTrue(waitLabel(progress, "3–4 / 5"))
        attach("iPad native CBZ spread")
        app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap(); XCTAssertTrue(waitGone(hide))
        app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.5)).tap()
        app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(hide.waitForExistence(timeout: 5))
        XCTAssertTrue(waitLabel(progress, "1–2 / 5"))
        app.buttons["reader-close"].tap()
        XCTAssertTrue(book.waitForExistence(timeout: 5)); book.tap()
        XCTAssertTrue(waitLabel(progress, "1–2 / 5"))
    }
    private func waitLabel(_ element: XCUIElement, _ label: String) -> Bool { XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", label), object: element)], timeout: 10) == .completed }
    private func waitGone(_ element: XCUIElement) -> Bool { XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: element)], timeout: 5) == .completed }
    private func waitEnabled(_ element: XCUIElement) -> Bool { XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: element)], timeout: 30) == .completed }
    @MainActor private func attach(_ name: String) { let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot) }
}
