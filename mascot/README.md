# Mascot

A SwiftUI mascot that reacts to how hard the machine is working. It is drawn entirely in code (shapes
and gradients, no image assets), reads battery, thermal state, Low Power Mode and CPU, and can speak
short in-character lines through Apple Intelligence (Foundation Models) with canned fallbacks.

The character is an original design. Name, colours and proportions are meant to be changed
(`MascotView.swift`, and the `look` table at its top).

## Status: written without a compiler

This was authored in a Linux container with no Swift toolchain. Nothing here has been compiled or
run by the author. `.github/workflows/mascot.yml` builds and tests it on a macOS runner (macOS build,
`swift test`, iOS Simulator build); check that job first. If it fails, fix the compile errors before
integrating. Expect small API-detail fixes, not redesigns.

## What is in the package

| File | Role |
|---|---|
| `Mood.swift` | `MascotMood`, `SystemSnapshot`, `MoodResolver`. Pure logic with hysteresis, unit-tested. |
| `SystemProbes.swift` | Battery (IOKit on macOS, UIDevice on iOS) and CPU (Mach). |
| `SystemPulse.swift` | `@Observable` monitor. Samples every 2 s (6 s when stressed) plus notifications. Exposes `mood`, `snapshot`, `isThrottled`, `setJobs(active:max:)`, `overrideSnapshot`. |
| `MascotView.swift` | The character. 30 fps, 12 fps when throttled, frozen when paused or Reduce Motion is on. |
| `MascotVoice.swift` | Chooses what it says. Foundation Models if available, otherwise canned lines. Rate limited. |
| `MascotCompanion.swift` | Drop-in view: mascot plus speech bubble. |
| `MascotBridge.swift` | `WKScriptMessageHandler` so the React UI can report running jobs. |

## Design rules to keep when integrating

1. **Plain code decides mood, the model only writes flavour text.** Do not feed raw metrics to the model to "decide" anything.
2. **The mascot must not be a battery hog.** Keep `isThrottled` and `isPaused` wired up; keep model calls rate limited.
3. **Always have a canned fallback.** Apple Intelligence needs compatible hardware, macOS/iOS 26+, and the feature switched on; check `SystemLanguageModel.default.availability`.
4. **Nothing from the web page reaches the model.** The bridge accepts two bounded integers only.
5. **Say what is a measurement.** On iOS, `cpu` is this app's own load, not the whole device. On macOS it is system-wide.

## Integration, option B (recommended): SwiftUI shell around the existing web app

The repo's web app (`../src`, served by `../server.ts` on `http://127.0.0.1:3000`) stays unchanged
except for one small reporting hook.

1. In Xcode create a macOS App (SwiftUI). Add this folder as a local package: *File > Add Package Dependencies > Add Local*, product `Mascot`. Deployment target macOS 14 or later (iOS 17 if you also target iPhone).
2. Host the web UI in a `WKWebView` (via `NSViewRepresentable`) pointed at the local server, and overlay the mascot:

```swift
import SwiftUI
import WebKit
import Mascot

@main struct StudioApp: App {
    @State private var pulse = SystemPulse()
    @State private var bridge: MascotBridge?
    var body: some Scene {
        WindowGroup {
            ZStack(alignment: .bottomTrailing) {
                StudioWebView(url: URL(string: "http://127.0.0.1:3000")!, bridge: bridge)
                MascotCompanion(pulse: pulse, scale: 0.55)
                    .padding(16)
                    .allowsHitTesting(false)   // clicks pass through to the web page
            }
            .task { bridge = MascotBridge(pulse: pulse) }
        }
    }
}
```

   `StudioWebView` is a standard `NSViewRepresentable` wrapping `WKWebView`. Create the
   `WKWebViewConfiguration`, call `bridge.attach(to: configuration)` before making the web view, and
   call `bridge.detach(from:)` in `dismantleNSView`. Start the Node/Python server from the app (or
   document that it must already be running).
3. Sandbox entitlements if the App Sandbox is on: `com.apple.security.network.client` (to reach localhost). Reading battery through IOKit needs no extra entitlement.
4. Report job load from the React side. Find where long jobs start and finish (the panels in `src/components/*Panel.tsx` and `IndeterminateLoader.tsx` are the places that show progress) and add a tiny helper:

```ts
// src/utils/pip.ts
let active = 0;
const MAX = 2; // keep in sync with MAX_CONCURRENT_JOBS in .env.example
function report() {
  (window as any).webkit?.messageHandlers?.pip?.postMessage({ type: 'jobs', active, max: MAX });
}
export async function trackJob<T>(work: () => Promise<T>): Promise<T> {
  active++; report();
  try { return await work(); } finally { active--; report(); }
}
```

   Wrap each long `fetch('/api/...')` call in `trackJob(...)`. In a normal browser `window.webkit` is
   undefined and the helper is a no-op, so the web app keeps working unchanged.

## Integration, option A: standalone companion

Skip the web view and the bridge. Use `MascotCompanion(pulse:)` in a small floating window or a
`MenuBarExtra(.window)` and let it watch the machine on its own.

## Testing by hand

- Preview: open `MascotView.swift` in Xcode and use the "All moods" preview.
- Force any state without stressing the machine: `pulse.overrideSnapshot = SystemSnapshot(battery: 0.1, thermal: .serious)`.
- Real stress: run `yes > /dev/null` in a few terminals for the *working* mood; Xcode's *Devices and Simulators > Device Conditions* can fake thermal states on iOS devices.
- Apple Intelligence: needs a supported Mac or iPhone with Apple Intelligence on. Where it is unavailable you should see canned lines only, and that is the intended fallback.
- `swift test` in this folder runs the mood logic tests.

## Tuning

- Thresholds and hysteresis: `MoodResolver.pick` in `Mood.swift`. The tests in `MoodTests.swift` document the intent.
- Look per mood: the `look` table in `MascotView.swift`.
- Voice: `personaName`, `minimumInterval` and the instructions in `MascotVoice.swift`.
