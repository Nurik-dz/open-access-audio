import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

extension MascotMood {
    /// Always-available lines. Used when Apple Intelligence is missing, off, rate limited or fails.
    public var cannedLines: [String] {
        switch self {
        case .chill: ["All quiet here. Nice and easy.", "Everything's running smoothly!", "Hi! I'm just vibing."]
        case .working: ["Busy busy busy!", "Your Mac is hard at work.", "Crunching away, hang tight."]
        case .hot: ["Phew, it's getting warm in here!", "We're running hot. Maybe a short break?", "Fans on full, hang in there!"]
        case .tired: ["Battery's getting low. Time for a charger?", "I'm getting sleepy...", "Running on fumes here."]
        case .charging: ["Ahh, fresh power!", "Charging up!", "Plugged in and happy."]
        case .saver: ["Low Power Mode. I'll take it easy too.", "Saving energy, one blink at a time."]
        }
    }

    /// Plain-language description given to the language model, so it never has to interpret raw numbers.
    var promptHint: String {
        switch self {
        case .chill: "The computer is calm and idle."
        case .working: "The computer is working hard right now."
        case .hot: "The computer is running hot."
        case .tired: "The battery is low and it is not charging."
        case .charging: "The computer is charging."
        case .saver: "Low Power Mode is on, so the computer is saving energy."
        }
    }
}

/// Makes model output safe to show: one line, no quotes, bounded length. `nil` means unusable.
enum LineSanitizer {
    static func clean(_ raw: String, maxLength: Int = 90) -> String? {
        let flat = raw
            .split(whereSeparator: \.isNewline)
            .joined(separator: " ")
            .trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: "\"\u{201C}\u{201D}")))
        guard !flat.isEmpty else { return nil }
        if flat.count <= maxLength { return flat }
        let cut = String(flat.prefix(maxLength - 1)).trimmingCharacters(in: .whitespaces)
        return cut + "\u{2026}"
    }
}

/// Picks what the mascot says. Uses the on-device Apple Intelligence model when it is available
/// (macOS / iOS 26 or later, compatible hardware, feature switched on) and falls back to canned lines.
///
/// The model only writes flavour text. Mood comes from `MoodResolver`. To avoid draining the battery
/// the mascot is meant to watch, model calls are limited to one per `minimumInterval`.
@MainActor
public final class MascotVoice {
    public var minimumInterval: TimeInterval
    public var personaName: String
    private var lastModelCall = Date.distantPast

    public init(minimumInterval: TimeInterval = 90, personaName: String = "Pip") {
        self.minimumInterval = minimumInterval
        self.personaName = personaName
    }

    /// True when the on-device model can be used right now.
    public var usesAppleIntelligence: Bool {
        #if canImport(FoundationModels)
        if #available(macOS 26.0, iOS 26.0, *) { return FoundationPip.isAvailable }
        #endif
        return false
    }

    public func line(for snapshot: SystemSnapshot, mood: MascotMood) async -> String {
        let canned = mood.cannedLines.randomElement() ?? ""
        guard Date().timeIntervalSince(lastModelCall) >= minimumInterval else { return canned }

        #if canImport(FoundationModels)
        if #available(macOS 26.0, iOS 26.0, *), FoundationPip.isAvailable {
            lastModelCall = Date()
            let battery = snapshot.battery.map { Int(($0 * 100).rounded()) }
            if let text = await FoundationPip.generate(name: personaName, mood: mood, batteryPercent: battery) {
                return text
            }
        }
        #endif
        return canned
    }
}

#if canImport(FoundationModels)
@available(macOS 26.0, iOS 26.0, *)
@Generable
struct PipLine {
    @Guide(description: "One warm, playful sentence of at most 12 words, spoken by the mascot")
    var message: String
}

@available(macOS 26.0, iOS 26.0, *)
enum FoundationPip {
    static var isAvailable: Bool {
        if case .available = SystemLanguageModel.default.availability { return true }
        return false
    }

    /// A fresh session per call keeps the transcript, and so the small context window, from growing.
    static func generate(name: String, mood: MascotMood, batteryPercent: Int?) async -> String? {
        let session = LanguageModelSession(instructions: """
            You are \(name), a small friendly mascot that lives in an app and comments on how hard \
            the user's computer is working. Speak in first person, be brief and warm, and never be \
            alarming. Do not use emoji or hashtags.
            """)
        var prompt = mood.promptHint
        if let batteryPercent { prompt += " Battery is at \(batteryPercent) percent." }
        prompt += " Say one short thing about it."

        do {
            let response = try await session.respond(to: prompt, generating: PipLine.self)
            return LineSanitizer.clean(response.content.message)
        } catch {
            return nil   // guardrail, cancellation, model not ready: caller uses a canned line
        }
    }
}
#endif
