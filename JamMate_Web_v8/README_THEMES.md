# JamMate — Three-Theme Mobile Webapp

This build integrates the original **Neon**, the **Medieval** edition, and the new **Ultra Modern Metal** appearance into one app. There are no changes to BLE commands, parameter ordering, preset storage, NAM model transfer, drum/looper commands, or transport telemetry.

## Using themes

Open **Setup → Display → Theme** and choose **Neon**, **Ultra Modern Metal**, or **Medieval**. The menu uses JamMate's small custom selector and is available in both normal navigation and Easy Mode's Setup overlay. The old Dark/Light/Vintage/Color cycling button is removed.

The theme changes immediately and is stored locally as `jammate.theme.v1`; it is restored on reload. On a fresh installation, the initial theme is **Ultra Modern Metal**. Themes can be changed without leaving the current screen or disconnecting BLE. If browser storage is unavailable, theme selection works for the session.

Neon is the existing vivid dark style. Medieval loads the original parchment / walnut / brass artwork. Metal uses brushed titanium, carbon-dark panels, stainless bevels, clean icy highlights, and amber for secondary emphasis. All theme assets are local; no font downloads or image CDNs are required.

## Files

- `css/metal.css` — new Metal visuals
- `css/medieval.css` and `assets/medieval-*.svg` — imported original Medieval skin
- `assets/metal-grain.svg` — subtle local brushed-steel texture
- `js/ui/ThemeManager.js` — selection, exclusivity and persistence
- `js/ui/mobile-shell.js` — visible theme dropdown under Setup → Display
- `index.html`, `js/app.js` — new selector, removal of old theme cycle
- `css/mobile-neon.css` — shared 48px Setup dropdown styling
- `sw.js` — cache version `jammate-ui-v06` and new theme assets

## Checks completed

- Node.js syntax checks for changed JS modules
- `node --test tests/mobile-neon.test.mjs tests/nam-v2b-integration.mjs`
- `node tests/three-theme.test.mjs` for saved choices / active style exclusivity
- `python tests/three-theme-browser.py` for touch dropdown at 320 × 568 and 390 × 844
- `python tests/mobile-v05-icons-dropdowns.py` for existing selectors and BLE callback mapping
- Offline Chromium rendering harness confirms zero horizontal overflow in three styles at 390 × 844

Browser navigation to localhost is blocked in the testing environment, so an end-to-end BLE/web-server test on an actual phone is still required. The preview PNGs are **offline CSS renderings** with representative values, not screenshots of a connected device.

## Deploy

Deploy the entire `JamMate_Web_v2b/` directory together (or copy the changed files preserving paths). Serve over HTTPS for Web Bluetooth. If the app was previously installed, refresh it once after the service worker updates to v06. The app will continue to use its existing `config.js`, preset data, and BLE protocol.
