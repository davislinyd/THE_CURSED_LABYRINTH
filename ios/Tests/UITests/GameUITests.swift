import XCTest

final class GameUITests:XCTestCase {
    override func setUpWithError() throws {continueAfterFailure=false}
    @MainActor func testChapterValidationTour() throws {
        let app=XCUIApplication();app.launchArguments=["--ui-testing","--validate"];app.launch()
        XCTAssertTrue(app.staticTexts["validation.status"].waitForExistence(timeout:60))
        if app.buttons["resume"].waitForExistence(timeout:3) {app.buttons["resume"].tap()}
        let complete=NSPredicate {_,_ in (Int(app.staticTexts["validation.status"].value as? String ?? "0") ?? 0)>0}
        expectation(for:complete,evaluatedWith:app)
        waitForExpectations(timeout:300)
        let proof=XCTAttachment(screenshot:app.screenshot());proof.name="chapter-tour-completed";proof.lifetime = .keepAlways;add(proof)
        // The validation loop leaves the chapter-complete modal after 120 rendered frames.
        expectation(for:NSPredicate(format:"label == %@","VALIDATION · 0"),evaluatedWith:app.staticTexts["validation.status"])
        waitForExpectations(timeout:20)
        app.buttons["pause"].tap()
        XCTAssertTrue(app.buttons["resume"].waitForExistence(timeout:10))
        XCUIDevice.shared.press(.home);app.activate()
        XCTAssertTrue(app.buttons["resume"].waitForExistence(timeout:10))
    }
    @MainActor func testBossValidationBothForms() throws {
        for difficulty in ["normal","hard"] {
            let app=XCUIApplication();app.launchArguments=["--ui-testing","--boss-test",difficulty,"--validate"];app.launch()
            let status=app.staticTexts["validation.status"]
            XCTAssertTrue(status.waitForExistence(timeout:60))
            if app.buttons["resume"].waitForExistence(timeout:2) {app.buttons["resume"].tap()}
            expectation(for:NSPredicate(format:"value == %@","1"),evaluatedWith:status)
            waitForExpectations(timeout:150)
            let proof=XCTAttachment(screenshot:app.screenshot());proof.name="boss-victory-"+difficulty;proof.lifetime = .keepAlways;add(proof)
            XCUIDevice.shared.press(.home)
        }
    }
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
    @MainActor func testGraphicsProfilesResizeOnly3D() throws {
        let app=XCUIApplication();app.launchArguments=["--ui-testing","--boss-test","normal"];app.launch()
        let status=app.staticTexts["render.status"]
        XCTAssertTrue(status.waitForExistence(timeout:60))
        expectation(for:NSPredicate(format:"value != %@","0x0"),evaluatedWith:status);waitForExpectations(timeout:10)
        app.buttons["pause"].tap()
        func pixels()->[Int] {(status.value as? String ?? "").split(separator:"x").compactMap{Int($0)}}
        let baseline=pixels();XCTAssertEqual(baseline.count,2)
        let initialScale=status.label=="performance" ? 1.5:status.label=="high" ? 2.5:2.0
        for index in [0,2,1] {
            app.buttons["pause.settings"].tap()
            let quality=app.segmentedControls["settings.quality"]
            XCTAssertTrue(quality.waitForExistence(timeout:5))
            quality.buttons.element(boundBy:index).tap()
            XCTAssertTrue(quality.buttons.element(boundBy:index).isSelected)
            app.buttons["settings.close"].tap()
            expectation(for:NSPredicate {_,_ in
                let actual=pixels();guard actual.count==2 else{return false}
                let scale=status.label=="performance" ? 1.5:status.label=="high" ? 2.5:2.0
                return abs(Double(actual[0])-Double(baseline[0])*scale/initialScale)<3 && abs(Double(actual[1])-Double(baseline[1])*scale/initialScale)<3
            },evaluatedWith:status)
            waitForExpectations(timeout:10)
            print("GRAPHICS_PROFILE",index,status.label,status.value ?? "")
        }
        app.buttons["return-title"].tap()
        XCTAssertTrue(app.buttons["developer-tests"].waitForExistence(timeout:10))
    }
    @MainActor func testNativeLaunchMenusAndControls() throws {
        let app=XCUIApplication();app.launchArguments=["--ui-testing"];app.launch()
        XCTAssertTrue(app.buttons["new-game"].waitForExistence(timeout:60))
        let title=XCTAttachment(screenshot:app.screenshot());title.name="title";title.lifetime = .keepAlways;add(title)
        app.buttons["settings"].tap();XCTAssertTrue(app.buttons["settings.close"].waitForExistence(timeout:5))
        let quality=app.segmentedControls["settings.quality"]
        XCTAssertTrue(quality.waitForExistence(timeout:5));XCTAssertEqual(quality.buttons.count,3)
        for index in [0,2,1] {quality.buttons.element(boundBy:index).tap();XCTAssertTrue(quality.buttons.element(boundBy:index).isSelected)}
        app.buttons["settings.close"].tap()
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
