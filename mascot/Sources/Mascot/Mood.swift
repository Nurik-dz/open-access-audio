import Foundation

/// How the mascot feels. Chosen by plain code from real measurements, never by the language model.
public enum MascotMood: String, CaseIterable, Sendable {
    case chill      // everything is calm
    case working    // CPU or app jobs are busy
    case hot        // thermal pressure (serious or critical)
    case tired      // battery low and not charging
    case charging   // plugged in and actually charging
    case saver      // Low Power Mode is on
}

/// One reading of the machine. All fractions are 0...1.
public struct SystemSnapshot: Equatable, Sendable {
    /// Battery charge. `nil` on machines without a battery (desktop Macs).
    public var battery: Double?
    public var charging: Bool
    public var lowPower: Bool
    public var thermal: ProcessInfo.ThermalState
    /// macOS: system-wide CPU load. iOS: this app's own CPU load. Already smoothed.
    public var cpu: Double
    /// Load reported by the host app, for example running jobs divided by the job limit.
    public var jobLoad: Double

    public init(
        battery: Double? = nil,
        charging: Bool = false,
        lowPower: Bool = false,
        thermal: ProcessInfo.ThermalState = .nominal,
        cpu: Double = 0,
        jobLoad: Double = 0
    ) {
        self.battery = battery
        self.charging = charging
        self.lowPower = lowPower
        self.thermal = thermal
        self.cpu = cpu
        self.jobLoad = jobLoad
    }

    public static let idle = SystemSnapshot()
}

/// Turns snapshots into moods. It remembers the previous mood so values hovering around a
/// threshold do not make the character flicker (enter thresholds are stricter than exit ones).
public struct MoodResolver: Sendable {
    public private(set) var current: MascotMood

    public init(start: MascotMood = .chill) { current = start }

    @discardableResult
    public mutating func resolve(_ snapshot: SystemSnapshot) -> MascotMood {
        current = Self.pick(snapshot, previous: current)
        return current
    }

    /// Priority: hot, tired, working, charging, saver, chill.
    public static func pick(_ s: SystemSnapshot, previous: MascotMood) -> MascotMood {
        let hot = s.thermal == .serious
            || s.thermal == .critical
            || (previous == .hot && s.thermal == .fair)
        if hot { return .hot }

        if let battery = s.battery, !s.charging {
            let limit = previous == .tired ? 0.25 : 0.20
            if battery < limit { return .tired }
        }

        let load = max(s.cpu, s.jobLoad)
        let busyLimit = previous == .working ? 0.50 : 0.70
        if load >= busyLimit { return .working }

        if s.charging { return .charging }
        if s.lowPower { return .saver }
        return .chill
    }
}
