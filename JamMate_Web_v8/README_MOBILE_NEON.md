# JamMate Mobile Neon — v0.2

This builds on the supplied JamMate_Web_v2b app and the first mobile neon shell. The original application still handles BLE messages, preset load/save requests, NAM, Files, DSP parameter indices and effects.

## Updated UI

1. **Preset:** The Home banner keeps the large full preset name, but now exposes **BANK** and **NUMBER** as two separate selects. Each change sends one preset-load request through the original `presetBank`/`presetNum` listeners. `Save Preset` still opens the existing modal, allowing selection of a save bank and slot.
2. **BPM & volume:** Two large horizontal sliders with bold numerical readouts. The slider value updates visually while dragging; the existing `sendGlobalUpdate()` logic runs once on release/change. Tempo changes retain the existing drum BPM update when drums are on. Ranges follow the original knob controls (BPM 0–255, Master 0–100).
3. **Easy Mode:** The seven destinations (FX, Looper, Drums, Tuner, NAM, Files, Setup) use **one horizontal row** above the on-Home effect grid. On very narrow screens (<360 CSS px), the strip scrolls sideways to retain usable touch targets. All Easy Mode destination screens and effect editors remain modal overlays over Home, and complete parameter lists scroll inside their dialogs.
4. **NAM:** Removed the large `JAMMATE MODEL BROWSER / POWERED BY TONE3000`, `Find your next tone`, and introductory paragraph. The **TONE3000 sign-in status/button** are preserved as a compact line inside the NAM search panel, along with search, filters, model results and local `.nam` file loading.
5. **Transport:** Drum and Looper beat/ring graphics are still reserved only; this release does not implement DSP → ESP → webapp timing telemetry or create a fake beat timer.

## Installation

Deploy the contents of `JamMate_Web_v2b/` using HTTPS for real Web Bluetooth, or a local web server for ordinary UI inspection. Existing original files are included in the full-source ZIP. In an existing deployment replace `index.html`, `css/mobile-neon.css`, `js/ui/mobile-shell.js`, and `tests/mobile-neon.test.mjs` (optional test). The stylesheet and script URL versions changed to `?v=2` for cache invalidation.

No changes are needed to DSP firmware, ESP UART framing, config.js or the preset protocol.

## Validation

- `node --check js/ui/mobile-shell.js`
- `node tests/mobile-neon.test.mjs`
- `node tests/nam-v2b-integration.mjs`
- `python tests/test-inline.py`
- Chromium DOM/mock-application interaction checks at 390×844 and 320×690: bank/slot forwarding, global volume slider commit, Easy Mode row, NAM sign-in/search retention, no horizontal document overflow.

**Limitations:** The browser environment blocked navigation to the running local app, so a complete live-app end-to-end test was not possible. Mock-based browser checks and the existing NAM regressions passed. BLE communication, mobile Safari, and real device performance still require testing.
