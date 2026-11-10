import XCTest

final class GameUITests:XCTestCase {
    override func setUpWithError() throws {continueAfterFailure=false}
    @MainActor func testDeveloperBossPractice() throws {
        let app=XCUIApplication();app.launchArguments=["--ui-testing"];app.launch()
        XCTAssertTrue(app.buttons["developer-tests"].waitForExistence(timeout:60))
        app.buttons["developer-tests"].tap()
        app.buttons["developer.boss.normal"].tap()
        let status=app.staticTexts["developer.status"]
        XCTAssertTrue(status.waitForExistence(timeout:20))
        expectation(for:NSPredicate(format:"value == %@","rotroot"),evaluatedWith:status)
        waitForExpectations(timeout:20)
        let normal=XCTAttachment(screenshot:app.screenshot());normal.name="developer-normal";normal.lifetime = .keepAlways;add(normal)
        app.buttons["pause"].tap();app.buttons["developer.restart"].tap()
        XCTAssertTrue(status.waitForExistence(timeout:10))
        app.buttons["pause"].tap();app.buttons["developer.switch"].tap();app.buttons["developer.boss.hard"].tap()
        expectation(for:NSPredicate(format:"value == %@","rotroot_wraith"),evaluatedWith:status)
        waitForExpectations(timeout:20)
        let hard=XCTAttachment(screenshot:app.screenshot());hard.name="developer-hard";hard.lifetime = .keepAlways;add(hard)
        app.buttons["pause"].tap();app.buttons["return-title"].tap()
        XCTAssertTrue(app.buttons["developer-tests"].waitForExistence(timeout:10));XCTAssertFalse(status.exists)
        XCUIDevice.shared.press(.home)
    }
    @MainActor func testNativeLaunchMenusAndControls() throws {
        let app=XCUIApplication();app.launchArguments=["--ui-testing"];app.launch()
        XCTAssertTrue(app.buttons["new-game"].waitForExistence(timeout:60))
        let title=XCTAttachment(screenshot:app.screenshot());title.name="title";title.lifetime = .keepAlways;add(title)
        app.buttons["settings"].tap();XCTAssertTrue(app.buttons["settings.close"].waitForExistence(timeout:5));app.buttons["settings.close"].tap()
        app.buttons["new-game"].tap()
        if !app.buttons["difficulty.normal"].waitForExistence(timeout:2) {
            let confirm=app.buttons.matching(NSPredicate(format:"label == '確定' OR label == 'CONFIRM'")).firstMatch
            if confirm.exists {confirm.tap()}
        }
        XCTAssertTrue(app.buttons["difficulty.normal"].waitForExistence(timeout:5));app.buttons["difficulty.normal"].tap()
        app.buttons["intro.skip"].tap()
        XCTAssertTrue(app.buttons["pause"].waitForExistence(timeout:20))
        let frame=XCTAttachment(screenshot:app.screenshot());frame.name="field";frame.lifetime = .keepAlways;add(frame)
        app.buttons["control.attack"].tap();app.buttons["control.strong"].tap();app.buttons["control.dodge"].tap()
        app.buttons["pause"].tap();XCTAssertTrue(app.buttons["resume"].waitForExistence(timeout:5));app.buttons["resume"].tap()
        app.buttons["map"].tap();XCTAssertTrue(app.buttons["map.close"].waitForExistence(timeout:5));app.buttons["map.close"].tap()
        XCUIDevice.shared.press(.home);app.activate()
        XCTAssertTrue(app.buttons["resume"].waitForExistence(timeout:10))
        let paused=XCTAttachment(screenshot:app.screenshot());paused.name="background-pause";paused.lifetime = .keepAlways;add(paused)
    }
}
