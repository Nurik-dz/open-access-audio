import Foundation
#if os(iOS)
import UIKit
#endif
#if os(macOS)
import IOKit.ps
#endif

struct PowerReading {
    var level: Double
    var charging: Bool
}

@MainActor
enum PowerSource {
    /// `nil` when the machine has no battery or the level is unknown (for example the iOS Simulator).
    static func read() -> PowerReading? {
        #if os(macOS)
        guard let info = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
              let list = IOPSCopyPowerSourcesList(info)?.takeRetainedValue() as? [CFTypeRef]
        else { return nil }
        for source in list {
            guard let d = IOPSGetPowerSourceDescription(info, source)?.takeUnretainedValue() as? [String: Any],
                  d[kIOPSTypeKey] as? String == kIOPSInternalBatteryType,
                  let current = d[kIOPSCurrentCapacityKey] as? Int,
                  let full = d[kIOPSMaxCapacityKey] as? Int, full > 0
            else { continue }
            let charging = (d[kIOPSIsChargingKey] as? Bool) ?? false
            return PowerReading(level: Double(current) / Double(full), charging: charging)
        }
        return nil
        #elseif os(iOS)
        let device = UIDevice.current
        device.isBatteryMonitoringEnabled = true
        guard device.batteryLevel >= 0 else { return nil }
        return PowerReading(level: Double(device.batteryLevel), charging: device.batteryState == .charging)
        #else
        return nil
        #endif
    }
}

/// CPU load as a 0...1 fraction.
/// - macOS: whole machine, from the change in Mach CPU tick counters between two calls.
/// - iOS: this app's own threads only (the sandbox hides system-wide numbers).
/// The first call returns `nil` on macOS because it needs a previous sample to compare with.
final class CPUSampler {
    #if os(macOS)
    private var previous: (UInt32, UInt32, UInt32, UInt32)?

    func sample() -> Double? {
        var count = mach_msg_type_number_t(MemoryLayout<host_cpu_load_info_data_t>.size / MemoryLayout<integer_t>.size)
        let capacity = Int(count)
        var info = host_cpu_load_info_data_t()
        let status = withUnsafeMutablePointer(to: &info) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: capacity) {
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count)
            }
        }
        guard status == KERN_SUCCESS else { return nil }

        // cpu_ticks order: user, system, idle, nice
        let now = (info.cpu_ticks.0, info.cpu_ticks.1, info.cpu_ticks.2, info.cpu_ticks.3)
        defer { previous = now }
        guard let before = previous else { return nil }

        let user = Double(now.0 &- before.0)
        let system = Double(now.1 &- before.1)
        let idle = Double(now.2 &- before.2)
        let nice = Double(now.3 &- before.3)
        let busy = user + system + nice
        let total = busy + idle
        return total > 0 ? busy / total : nil
    }
    #elseif os(iOS)
    func sample() -> Double? {
        var threads: thread_act_array_t?
        var threadCount = mach_msg_type_number_t(0)
        guard task_threads(mach_task_self_, &threads, &threadCount) == KERN_SUCCESS,
              let threads else { return nil }

        var total = 0.0
        for index in 0..<Int(threadCount) {
            var info = thread_basic_info_data_t()
            var infoCount = mach_msg_type_number_t(MemoryLayout<thread_basic_info_data_t>.size / MemoryLayout<integer_t>.size)
            let capacity = Int(infoCount)
            let status = withUnsafeMutablePointer(to: &info) { pointer in
                pointer.withMemoryRebound(to: integer_t.self, capacity: capacity) {
                    thread_info(threads[index], thread_flavor_t(THREAD_BASIC_INFO), $0, &infoCount)
                }
            }
            if status == KERN_SUCCESS, info.flags & TH_FLAGS_IDLE == 0 {
                total += Double(info.cpu_usage) / Double(TH_USAGE_SCALE)
            }
        }
        vm_deallocate(
            mach_task_self_,
            vm_address_t(UInt(bitPattern: threads)),
            vm_size_t(Int(threadCount) * MemoryLayout<thread_t>.stride)
        )
        return min(total / Double(ProcessInfo.processInfo.activeProcessorCount), 1)
    }
    #else
    func sample() -> Double? { nil }
    #endif
}
