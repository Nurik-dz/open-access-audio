import SwiftUI

/// Per-mood pose and colours. Pure data, so tuning the character means editing this table.
struct MascotLook {
    var bobSpeed: Double
    var bobAmplitude: Double
    var eyeOpen: CGFloat
    var mouthOpen: CGFloat
    var smile: CGFloat          // -1 frown ... 1 wide smile
    var flush: Double           // 0...1 cheek and face warmth
    var sweat: Bool
    var symbol: String?
    var symbolColor: Color
    var eye: [Color]            // inner to outer
}

extension MascotMood {
    private static let warmEye: [Color] = [.yellow, .orange, Color(red: 0.85, green: 0.2, blue: 0.1)]

    var look: MascotLook {
        switch self {
        case .chill:
            MascotLook(bobSpeed: 2, bobAmplitude: 3, eyeOpen: 1, mouthOpen: 0.35, smile: 0.8,
                       flush: 0, sweat: false, symbol: nil, symbolColor: .clear, eye: Self.warmEye)
        case .working:
            MascotLook(bobSpeed: 7, bobAmplitude: 3.5, eyeOpen: 1, mouthOpen: 0.55, smile: 0.3,
                       flush: 0.35, sweat: true, symbol: nil, symbolColor: .clear, eye: Self.warmEye)
        case .hot:
            MascotLook(bobSpeed: 9, bobAmplitude: 2, eyeOpen: 0.85, mouthOpen: 0.7, smile: -0.3,
                       flush: 1, sweat: true, symbol: nil, symbolColor: .clear,
                       eye: [.orange, Color(red: 0.95, green: 0.25, blue: 0.1), Color(red: 0.6, green: 0.05, blue: 0.05)])
        case .tired:
            MascotLook(bobSpeed: 1, bobAmplitude: 2, eyeOpen: 0.35, mouthOpen: 0.1, smile: -0.5,
                       flush: 0, sweat: false, symbol: "zzz", symbolColor: .indigo,
                       eye: [Color(red: 0.95, green: 0.8, blue: 0.5), Color(red: 0.85, green: 0.55, blue: 0.3), Color(red: 0.6, green: 0.35, blue: 0.2)])
        case .charging:
            MascotLook(bobSpeed: 2.4, bobAmplitude: 3, eyeOpen: 1, mouthOpen: 0.5, smile: 1,
                       flush: 0, sweat: false, symbol: "bolt.fill", symbolColor: .yellow,
                       eye: [.white, .yellow, .orange])
        case .saver:
            MascotLook(bobSpeed: 1.2, bobAmplitude: 2, eyeOpen: 0.6, mouthOpen: 0.15, smile: 0.5,
                       flush: 0, sweat: false, symbol: "leaf.fill", symbolColor: .green, eye: Self.warmEye)
        }
    }

    var accessibilityDescription: String {
        switch self {
        case .chill: "Mascot, relaxed. Your computer is calm."
        case .working: "Mascot, busy. Your computer is working hard."
        case .hot: "Mascot, overheating. Your computer is under thermal pressure."
        case .tired: "Mascot, sleepy. Battery is low."
        case .charging: "Mascot, happy. Your computer is charging."
        case .saver: "Mascot, calm. Low Power Mode is on."
        }
    }
}

/// The character. Drawn only with SwiftUI shapes and gradients, no image assets.
/// The drawing space is 220 x 260 points; `scale` resizes the whole figure.
public struct MascotView: View {
    public var mood: MascotMood
    public var isWaving: Bool
    /// Draw at 12 fps instead of 30 fps (Low Power Mode, thermal pressure).
    public var isThrottled: Bool
    /// Freeze the animation entirely (window hidden or app inactive).
    public var isPaused: Bool
    public var scale: CGFloat

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(
        mood: MascotMood,
        isWaving: Bool = false,
        isThrottled: Bool = false,
        isPaused: Bool = false,
        scale: CGFloat = 1
    ) {
        self.mood = mood
        self.isWaving = isWaving
        self.isThrottled = isThrottled
        self.isPaused = isPaused
        self.scale = scale
    }

    public var body: some View {
        let still = reduceMotion || isPaused
        TimelineView(.animation(minimumInterval: isThrottled ? 1.0 / 12 : 1.0 / 30, paused: still)) { context in
            figure(t: still ? 0 : context.date.timeIntervalSinceReferenceDate)
                .frame(width: 220, height: 260)
                .scaleEffect(scale)
                .frame(width: 220 * scale, height: 260 * scale)
        }
        .animation(.smooth, value: mood)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(mood.accessibilityDescription)
    }

    // MARK: - Figure

    @ViewBuilder
    private func figure(t: Double) -> some View {
        let look = mood.look
        let bob = sin(t * look.bobSpeed) * look.bobAmplitude
        let blink: CGFloat = t.truncatingRemainder(dividingBy: 4.3) < 0.13 ? 0.08 : 1
        let antennaSway = sin(t * 1.7) * 6 + sin(t * 0.9) * 3
        let armAngle: Double = isWaving ? -140 + sin(t * 9) * 14 : -6

        ZStack {
            // Contact shadow stays on the ground while the body bobs.
            Ellipse().fill(.black.opacity(0.14))
                .frame(width: 120, height: 14).blur(radius: 5)
                .position(x: 110, y: 247)

            ZStack {
                antenna(sway: antennaSway)

                // Far arm, behind the body.
                limb().frame(width: 24, height: 66)
                    .rotationEffect(.degrees(6), anchor: .top)
                    .position(x: 62, y: 195)

                // Ears
                soft(radius: 60).frame(width: 48, height: 48).clipShape(Circle()).position(x: 30, y: 86)
                soft(radius: 60).frame(width: 48, height: 48).clipShape(Circle()).position(x: 190, y: 86)

                // Body
                soft(radius: 120).frame(width: 92, height: 110).clipShape(Ellipse()).position(x: 110, y: 188)

                // Head
                headView(look: look).position(x: 110, y: 100)

                // Face
                HStack(spacing: 34) {
                    eye(look: look, blink: blink)
                    eye(look: look, blink: blink)
                }
                .position(x: 110, y: 98)

                Mouth(open: look.mouthOpen, curve: look.smile)
                    .fill(Color(white: 0.12))
                    .overlay(Mouth(open: look.mouthOpen, curve: look.smile)
                        .stroke(Color(white: 0.12), style: StrokeStyle(lineWidth: 5, lineCap: .round)))
                    .frame(width: 64, height: 38)
                    .position(x: 110, y: 138)

                Circle().fill(Color.red.opacity(0.28 * look.flush)).frame(width: 26).blur(radius: 5)
                    .position(x: 46, y: 124)
                Circle().fill(Color.red.opacity(0.28 * look.flush)).frame(width: 26).blur(radius: 5)
                    .position(x: 174, y: 124)

                // Near arm, in front so it stays visible when raised to wave.
                limb().frame(width: 24, height: 66)
                    .rotationEffect(.degrees(armAngle), anchor: .top)
                    .position(x: 164, y: 201)
            }
            .offset(y: bob)

            if look.sweat {
                Image(systemName: "drop.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(Color.cyan.opacity(0.85))
                    .position(x: 196, y: 52 + CGFloat(t.truncatingRemainder(dividingBy: 1.4)) * 14)
            }
            if let symbol = look.symbol {
                Image(systemName: symbol)
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(look.symbolColor)
                    .position(x: 198, y: 28 + CGFloat(bob))
            }
        }
        .frame(width: 220, height: 260)
    }

    // MARK: - Parts

    /// Soft matte shading with the light coming from the upper left.
    private func soft(radius: CGFloat) -> some View {
        Rectangle().fill(RadialGradient(
            colors: [.white, Color(red: 0.80, green: 0.83, blue: 0.93)],
            center: UnitPoint(x: 0.32, y: 0.28),
            startRadius: 2,
            endRadius: radius
        ))
    }

    private func limb() -> some View {
        Capsule().fill(LinearGradient(
            colors: [.white, Color(red: 0.84, green: 0.86, blue: 0.94)],
            startPoint: .topLeading, endPoint: .bottomTrailing
        ))
    }

    private func headView(look: MascotLook) -> some View {
        soft(radius: 190)
            .frame(width: 196, height: 150)
            .clipShape(Ellipse())
            .overlay(Ellipse().fill(Color(red: 1, green: 0.55, blue: 0.45).opacity(0.28 * look.flush)))
            .overlay(alignment: .topLeading) {
                Ellipse().fill(.white.opacity(0.7)).frame(width: 64, height: 26)
                    .blur(radius: 6).rotationEffect(.degrees(-22)).offset(x: 36, y: 22)
            }
            .shadow(color: .black.opacity(0.10), radius: 6, y: 4)
    }

    private func eye(look: MascotLook, blink: CGFloat) -> some View {
        Ellipse()
            .fill(RadialGradient(colors: look.eye, center: .center, startRadius: 1, endRadius: 26))
            .frame(width: 38, height: 44)
            .overlay(alignment: .topLeading) {
                Circle().fill(.white.opacity(0.92)).frame(width: 9, height: 9).offset(x: 9, y: 9)
            }
            .shadow(color: (look.eye.last ?? .clear).opacity(0.5), radius: 8)
            .scaleEffect(y: max(0.06, look.eyeOpen * blink))
    }

    /// Bent antenna with a ball on the end, swaying around its base inside the head.
    private func antenna(sway: Double) -> some View {
        ZStack {
            Path { p in
                p.move(to: CGPoint(x: 98, y: 34))
                p.addQuadCurve(to: CGPoint(x: 58, y: 16), control: CGPoint(x: 96, y: -4))
            }
            .stroke(Color(white: 0.15), style: StrokeStyle(lineWidth: 5, lineCap: .round))

            soft(radius: 30).frame(width: 26, height: 26).clipShape(Circle())
                .position(x: 46, y: 21)
        }
        .frame(width: 220, height: 260)
        .rotationEffect(.degrees(sway), anchor: UnitPoint(x: 98.0 / 220.0, y: 34.0 / 260.0))
    }
}

/// Mouth outline. `open` is how far the lower lip drops, `curve` bends both lips up (smile) or down (frown).
struct Mouth: Shape {
    var open: CGFloat
    var curve: CGFloat

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(open, curve) }
        set { open = newValue.first; curve = newValue.second }
    }

    func path(in rect: CGRect) -> Path {
        var p = Path()
        let left = CGPoint(x: rect.minX, y: rect.midY)
        let right = CGPoint(x: rect.maxX, y: rect.midY)
        p.move(to: left)
        p.addQuadCurve(to: right, control: CGPoint(x: rect.midX, y: rect.midY + rect.height * 0.5 * curve))
        p.addQuadCurve(to: left, control: CGPoint(x: rect.midX, y: rect.midY + rect.height * (0.5 * curve + open)))
        p.closeSubpath()
        return p
    }
}

#Preview("All moods") {
    LazyVGrid(columns: Array(repeating: GridItem(.fixed(150)), count: 3), spacing: 12) {
        ForEach(MascotMood.allCases, id: \.self) { mood in
            VStack {
                MascotView(mood: mood, isWaving: mood == .chill, scale: 0.6)
                Text(mood.rawValue).font(.caption)
            }
        }
    }
    .padding()
}
