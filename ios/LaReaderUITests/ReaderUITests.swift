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
        // Reach a settled location through real page turns. XCTest's slider
        // adjustment is unreliable in a rotated simulator and is unrelated
        // to the reflow regression this test covers.
        for _ in 0..<24 {
            let current = try XCTUnwrap(Double(progress.label.replacingOccurrences(of: "%", with: "")))
            if current >= 25 { break }
            XCTAssertTrue(waitEnabled(hide))
            let previous = progress.label
            app.buttons["Trang sau"].tap()
            XCTAssertTrue(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != %@", previous), object: progress)], timeout: 10) == .completed)
        }
        let readingPosition = try XCTUnwrap(Double(progress.label.replacingOccurrences(of: "%", with: "")))
        XCTAssertGreaterThanOrEqual(readingPosition, 25)
        app.buttons["reader-settings"].tap()
        XCTAssertTrue(app.switches["reader-double"].waitForExistence(timeout: 5))
        attach("iPad native settings")
        app.buttons["Xong"].tap()
        attach("iPad native EPUB landscape")
        XCUIDevice.shared.orientation = .portrait
        XCTAssertTrue(hide.waitForExistence(timeout: 5))
        XCTAssertTrue(waitEnabled(hide))
        XCTAssertTrue(waitProgress(progress, near: readingPosition))
        let web = app.webViews.firstMatch
        XCTAssertTrue(web.waitForExistence(timeout: 10))
        XCTAssertGreaterThan(web.frame.height, app.windows.firstMatch.frame.height * 0.55, "Portrait reader must not retain the landscape viewport height")
        attach("iPad native EPUB portrait")
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(waitEnabled(hide))
        XCTAssertTrue(waitProgress(progress, near: readingPosition))
        app.buttons["reader-close"].tap()
        XCTAssertTrue(book.waitForExistence(timeout: 5)); book.tap()
        XCTAssertTrue(hide.waitForExistence(timeout: 20)); XCTAssertTrue(waitEnabled(hide))
        XCTAssertTrue(waitProgress(progress, near: readingPosition))
        let singlePosition = try XCTUnwrap(Double(progress.label.replacingOccurrences(of: "%", with: "")))
        app.buttons["reader-settings"].tap()
        let double = app.switches["reader-double"]
        XCTAssertTrue(double.waitForExistence(timeout: 5))
        if double.value as? String == "1" {
            let control = double.switches.firstMatch
            if control.exists { control.tap() }
            else { double.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap() }
        }
        XCTAssertEqual(double.value as? String, "0")
        app.buttons["Xong"].tap()
        XCUIDevice.shared.orientation = .portrait
        XCTAssertTrue(waitEnabled(hide))
        XCTAssertTrue(waitProgress(progress, near: singlePosition))
        XCTAssertGreaterThan(web.frame.height, app.windows.firstMatch.frame.height * 0.55)
        attach("Native EPUB single-page portrait")
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
        if double.value as? String == "0" {
            let control = double.switches.firstMatch
            if control.exists { control.tap() }
            else { double.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap() }
        }
        XCTAssertTrue(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == '1'"), object: double)], timeout: 5) == .completed)
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
    private func waitProgress(_ element: XCUIElement, near expected: Double, tolerance: Double = 10) -> Bool {
        let predicate = NSPredicate { _, _ in
            guard let value = Double(element.label.replacingOccurrences(of: "%", with: "")) else { return false }
            // A different viewport may begin earlier within the same page.
            return abs(value - expected) <= tolerance
        }
        return XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: predicate, object: element)], timeout: 30) == .completed
    }
    private func waitGone(_ element: XCUIElement) -> Bool { XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: element)], timeout: 5) == .completed }
    private func waitEnabled(_ element: XCUIElement) -> Bool { XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: element)], timeout: 60) == .completed }
    @MainActor private func attach(_ name: String) { let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); shot.name = name; shot.lifetime = .keepAlways; add(shot) }
}
