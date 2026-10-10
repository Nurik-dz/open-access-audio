import XCTest
@testable import Mascot

final class MoodTests: XCTestCase {
    private func pick(_ s: SystemSnapshot, from previous: MascotMood = .chill) -> MascotMood {
        MoodResolver.pick(s, previous: previous)
    }

    func testIdleMachineIsChill() {
        XCTAssertEqual(pick(SystemSnapshot(battery: 0.8, cpu: 0.1)), .chill)
    }

    func testThermalPressureBeatsEverything() {
        let s = SystemSnapshot(battery: 0.05, charging: false, thermal: .serious, cpu: 0.99)
        XCTAssertEqual(pick(s), .hot)
        XCTAssertEqual(pick(SystemSnapshot(thermal: .critical)), .hot)
    }

    func testHotHasHysteresisAtFair() {
        let fair = SystemSnapshot(thermal: .fair)
        XCTAssertEqual(pick(fair, from: .chill), .chill)
        XCTAssertEqual(pick(fair, from: .hot), .hot)
        XCTAssertEqual(pick(SystemSnapshot(thermal: .nominal), from: .hot), .chill)
    }

    func testLowBatteryIsTiredOnlyWhenNotCharging() {
        XCTAssertEqual(pick(SystemSnapshot(battery: 0.15)), .tired)
        XCTAssertEqual(pick(SystemSnapshot(battery: 0.15, charging: true)), .charging)
    }

    func testTiredHasHysteresis() {
        let s = SystemSnapshot(battery: 0.22)
        XCTAssertEqual(pick(s, from: .chill), .chill)
        XCTAssertEqual(pick(s, from: .tired), .tired)
        XCTAssertEqual(pick(SystemSnapshot(battery: 0.30), from: .tired), .chill)
    }

    func testWorkingHasHysteresis() {
        let s = SystemSnapshot(cpu: 0.6)
        XCTAssertEqual(pick(s, from: .chill), .chill)
        XCTAssertEqual(pick(s, from: .working), .working)
        XCTAssertEqual(pick(SystemSnapshot(cpu: 0.8), from: .chill), .working)
        XCTAssertEqual(pick(SystemSnapshot(cpu: 0.4), from: .working), .chill)
    }

    func testAppJobsMakeItWorkEvenWhenCPUIsLow() {
        XCTAssertEqual(pick(SystemSnapshot(cpu: 0.05, jobLoad: 1)), .working)
    }

    func testMachineWithoutBatteryNeverGetsTired() {
        XCTAssertEqual(pick(SystemSnapshot(battery: nil, cpu: 0.1)), .chill)
    }

    func testLowPowerModeShowsSaverWhenOtherwiseCalm() {
        XCTAssertEqual(pick(SystemSnapshot(battery: 0.7, lowPower: true)), .saver)
    }

    func testResolverRemembersPreviousMood() {
        var resolver = MoodResolver()
        XCTAssertEqual(resolver.resolve(SystemSnapshot(cpu: 0.8)), .working)
        XCTAssertEqual(resolver.resolve(SystemSnapshot(cpu: 0.6)), .working)
        XCTAssertEqual(resolver.resolve(SystemSnapshot(cpu: 0.3)), .chill)
    }

    func testEveryMoodHasLinesAndAnAccessibilityLabel() {
        for mood in MascotMood.allCases {
            XCTAssertFalse(mood.cannedLines.isEmpty, "\(mood) has no canned lines")
            XCTAssertFalse(mood.accessibilityDescription.isEmpty)
        }
    }

    func testSanitizerCleansAndBoundsModelOutput() {
        XCTAssertNil(LineSanitizer.clean("   \n  "))
        XCTAssertEqual(LineSanitizer.clean("\"Hello there!\"\n"), "Hello there!")
        XCTAssertEqual(LineSanitizer.clean("line one\nline two"), "line one line two")
        let long = String(repeating: "a", count: 300)
        XCTAssertEqual(LineSanitizer.clean(long)?.count, 90)
    }
}
