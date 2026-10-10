import SwiftUI

/// Ready-made drop-in: the mascot plus a speech bubble. It says something when its mood changes
/// and shows it for a few seconds. Share one `SystemPulse` with whatever feeds it app-level load.
public struct MascotCompanion: View {
    private let pulse: SystemPulse
    private let scale: CGFloat
    private let speaks: Bool

    @State private var voice = MascotVoice()
    @State private var bubble: String?
    @State private var waving = false
    @State private var speechTask: Task<Void, Never>?
    @Environment(\.scenePhase) private var scenePhase

    public init(pulse: SystemPulse, scale: CGFloat = 1, speaks: Bool = true) {
        self.pulse = pulse
        self.scale = scale
        self.speaks = speaks
    }

    public var body: some View {
        VStack(spacing: 6) {
            if let bubble {
                Text(bubble)
                    .font(.callout)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .frame(maxWidth: 240)
                    .transition(.scale(scale: 0.8, anchor: .bottom).combined(with: .opacity))
            }
            MascotView(
                mood: pulse.mood,
                isWaving: waving,
                isThrottled: pulse.isThrottled,
                isPaused: scenePhase != .active,
                scale: scale
            )
        }
        .task {
            pulse.start()
            say(pulse.mood)
        }
        .onChange(of: pulse.mood) { _, newMood in say(newMood) }
        .onDisappear {
            speechTask?.cancel()
            pulse.stop()
        }
    }

    private func say(_ mood: MascotMood) {
        guard speaks else { return }
        speechTask?.cancel()
        speechTask = Task { @MainActor in
            let text = await voice.line(for: pulse.snapshot, mood: mood)
            guard !Task.isCancelled else { return }
            withAnimation(.spring) {
                bubble = text
                waving = (mood == .chill || mood == .charging)
            }
            try? await Task.sleep(for: .seconds(6))
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut) {
                bubble = nil
                waving = false
            }
        }
    }
}
