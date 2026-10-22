# JamMate Mobile Neon v0.3 — fullscreen & setup controls

Built on JamMate Web Neon v0.2; preserves the existing BLE, NAM, Files, Save Preset, effects, and DSP message handling.

## Changes

- **Preset hero:** only Bank and Number dropdowns; no PRESET heading or duplicate name. Both selectors are enlarged and remain connected to the existing `presetBank` and `presetNum` controls.
- **Easy Mode:** a compact ON/OFF button available exclusively under **Setup → Display**. Removed the Easy Mode button on Home and from the hamburger connection menu. Easy Mode retains all 18 effects on Home and effect parameter pop-ups.
- **Fullscreen:** responsive fixed viewport and installed-app manifest with `display: fullscreen`. An **Enter/Exit Full Screen** action is in Setup → Display for browsers supporting the Fullscreen API. A normal browser tab cannot force fullscreen on page load because browsers require an explicit user gesture; install JamMate on the home screen and launch its icon for automatic standalone/fullscreen presentation where supported.
- **Viewport sizing:** CSS `100dvh`, safe-area insets, pinned CPU/beat footer, independent scrolling of content/modal, compact rules for height ≤750 px and width ≤359 px. Tested as a rendered component at 320×700, 375×667, 390×844, and 430×932 viewport dimensions with no document-wide horizontal overflow.
- **Navigation fix:** setup/tuner/NAM/files views now replace previous Home content instead of accidentally appearing below it.

## Mobile fullscreen deployment

1. Serve the unzipped `JamMate_Web_v2b` folder over **HTTPS** (or localhost for development). BLE also requires an appropriate secure context in supported browsers.
2. Android Chrome: Add/Install to Home screen, then open JamMate from its home-screen icon for fullscreen display as supported by the platform.
3. iOS Safari: Share → Add to Home Screen → launch the home-screen icon. Browser/OS UI may still be visible depending on iOS version and platform policy.
4. In an ordinary browser tab, open **Setup → Display → Full Screen**. It requires a tap/click and may be unavailable on some iOS browsers.

Browser address bars cannot be hidden programmatically on initial navigation; no webpage can guarantee fullscreen when launched as an ordinary browser tab.

## Changed files

- `index.html` — PWA metadata, mobile bundle revision, optional service-worker registration.
- `css/mobile-neon.css` — layout and Setup display controls.
- `js/ui/mobile-shell.js` — selector-only preset, Setup mode/fullscreen controls, navigation fix.
- `manifest.webmanifest` — installable portrait, fullscreen app metadata.
- `sw.js` — network-first same-origin application shell fallback.
- `assets/jammate-192.png`, `assets/jammate-512.png` — home-screen icons.
- `tests/mobile-neon.test.mjs`, `tests/mobile-v03-smoke.py` — validation.

## Caveats

- The independent looper and drum graphics still wait for actual DSP/ESP telemetry. No synthetic beat source was added.
- The footer reports `CPU --` until real telemetry is provided.
- The rendering smoke test uses a mocked app to test the mobile shell; it is not an end-to-end BLE/device test.
- PWA install/fullscreen behavior varies across Chrome and Safari; verify on your actual phone.
