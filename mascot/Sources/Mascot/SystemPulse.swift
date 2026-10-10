import Foundation
import Observation

/// Watches battery, thermal state, Low Power Mode and CPU, and exposes the resulting mood.
///
/// Call `start()` when the mascot appears and `stop()` when it goes away. It samples every 2 s
/// (6 s while the machine is stressed, so the mascot never adds to the problem) and also reacts
/// at once to thermal-state and Low Power Mode notifications.
@MainActor @Observable
public final class SystemPulse {
    public private(set) var snapshot = SystemSnapshot.idle
    public private(set) var mood: MascotMood = .chill
    /// True under Low Power Mode or serious thermal pressure. Views should draw less often.
    public private(set) var isThrottled = false

    /// For previews, demos and tests: when set, real measurements are ignored.
    public var overrideSnapshot: SystemSnapshot? {
        didSet { refresh() }
    }

    @ObservationIgnored private var resolver = MoodResolver()
    @ObservationIgnored private let cpuSampler = CPUSampler()
    @ObservationIgnored private var smoothedCPU = 0.0
    @ObservationIgnored private var jobLoad = 0.0
    @ObservationIgnored private var loop: Task<Void, Never>?
    @ObservationIgnored private var observers: [Task<Void, Never>] = []

    public init() {}

    public func start() {
        guard loop == nil else { return }
        refresh()

        loop = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                self.refresh()
                let seconds: Double = self.isThrottled ? 6 : 2
                try? await Task.sleep(for: .seconds(seconds))
            }
        }

        let names: [Notification.Name] = [
            ProcessInfo.thermalStateDidChangeNotification,
            Notification.Name.NSProcessInfoPowerStateDidChange,
        ]
        for name in names {
            observers.append(Task { [weak self] in
                for await _ in NotificationCenter.default.notifications(named: name) {
                    self?.refresh()
                }
            })
        }
    }

    public func stop() {
        loop?.cancel()
        loop = nil
        observers.forEach { $0.cancel() }
        observers.removeAll()
    }

    /// Tell the mascot how busy the host app's own work is, for example running jobs out of the allowed maximum.
    public func setJobs(active: Int, max limit: Int) {
        guard limit > 0, active >= 0 else { return }
        jobLoad = min(1, Double(active) / Double(limit))
        refresh()
    }

    private func refresh() {
        let next: SystemSnapshot
        if let overrideSnapshot {
            next = overrideSnapshot
        } else {
            if let measured = cpuSampler.sample() {
                smoothedCPU = smoothedCPU * 0.65 + measured * 0.35
            }
            let power = PowerSource.read()
            next = SystemSnapshot(
                battery: power?.level,
                charging: power?.charging ?? false,
                lowPower: ProcessInfo.processInfo.isLowPowerModeEnabled,
                thermal: ProcessInfo.processInfo.thermalState,
                cpu: smoothedCPU,
                jobLoad: jobLoad
            )
        }
        snapshot = next
        mood = resolver.resolve(next)
        isThrottled = next.lowPower || next.thermal.rawValue >= ProcessInfo.ThermalState.serious.rawValue
    }
}
