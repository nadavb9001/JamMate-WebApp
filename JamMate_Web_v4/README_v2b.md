# JamMate Web v2b — NAM thumbnail browser

Built from the user's `JamMate_Web_v2a.zip`. The rest of the Effects/Drum/Looper/Tuner/Setup/Files UI, BLE packet protocol, and controller configuration are unchanged.

## What is new

- NAM tab now shows a TONE3000-inspired, responsive thumbnail list of **tone packs**. Uses the public `Tone.images[0]` URL returned by the authorized TONE3000 API; draws a neutral amp illustration when the tone has no artwork or the image fails.
- Gear/format, creator and download count shown next to each thumbnail. TONE3000 branding remains visible.
- Tap a card to open tone details and select one of its actual **A2 model variants** (fetched via `/models?tone_id=…&architecture=2&page_size=300`). The A2 model selector uses the pack's artwork; TONE3000 API currently supplies artwork per tone pack, not independently for each model variation.
- Search automatically requests `format=nam&architecture=2`, with sort and gear filters. Pagination is retained.
- A new Send to JamMate button sends the **selected model URL** through the same NAM download → weight validation → BLE ACK/chunk transfer pipeline as v2a. If disconnected, it shows an inline explanation and does not attempt a transfer.
- Sign-in (existing OAuth PKCE), official Browse TONE3000 Select flow, local .nam loading, transfer status, and unloading remain available.
- Untrusted API text is placed in `textContent` instead of injected HTML, and thumbnail URLs are limited to http(s).

## Running

1. Deploy or serve the files over **HTTPS** (or `localhost` where Web Bluetooth permits). Do not open `index.html` directly via `file://` for real OAuth/BLE use.
2. Connect your JamMate over BLE using the top Connect button.
3. Open NAM → Connect TONE3000 to sign in. Search or choose the official **Browse TONE3000** selector.
4. Select a thumbnail, choose the specific A2 model variant, and choose **Send to JamMate**.
5. Wait for the existing device ACK and CRC completion before unplugging.

The existing NAM loader recognizes only the compatible A2 Lite weight layout (1871 float32 weights). A model shown as A2 by the API is still validated **after download** before transfer. Unsupported models will report an error rather than being sent.

## Changed files

- `index.html` — NAM tab markup and CSS inclusion; version label.
- `css/nam-v2b.css` — new responsive NAM styling, including thumbnail fallbacks.
- `js/ui/NamBrowserV2b.js` — authenticated search, cards, detail/model selector, progress and transfer wiring.
- `js/app.js` — initializes new NAM view using the existing NamLoader.
- `js/NamLoader.js` — preserves original transfer code, adds managed-browser option, A2 filtering, model-list and selected-model transfer APIs.
- `tests/nam-v2b-integration.mjs` — offline integration smoke test for API request filters, A2 variant selection and transfer routing.

## Tests performed

- `node --check` for changed `.js` files.
- `node tests/nam-v2b-integration.mjs`: PASSED (mock search/model responses, selected variant routing).
- Browser DOM/render tests with mocked tone/model responses: PASSED on 1250 px desktop and 390 px mobile; no horizontal page overflow; malformed image URLs fall back safely; selecting variant works; BLE disconnected guard works.
- Screenshots taken separately from the package, using **illustrative mock tone data** (not real TONE3000 catalogue entries).

**Not tested here:** actual TONE3000 OAuth response and live search (requires user authentication), image CDN delivery, or an ESP/Daisy BLE transfer and CRC acknowledgement (requires JamMate hardware).

## TONE3000 API usage

TONE3000's published documentation says `/tones/search` is rate-limited and that commercial integrations require permission/agreement. The official **Browse TONE3000** OAuth Select option is kept as a first-class path. Ensure the API terms appropriate for your distribution are satisfied: https://www.tone3000.com/api

The interface is independently styled for JamMate; it borrows the thumbnail + pack-detail + model-variant selection concept, not the TONE3000 plugin source or its JUCE UI.

## v2b inline NAM model selection update (2026-10-15)

Selecting a NAM tone card now opens its detailed model selector **at that position in the results**, instead of using the permanently positioned panel above the model list. Desktop expands beneath the current two-card row, mobile expands directly below the tapped card. The selected card is highlighted and may be tapped a second time to collapse the details. Selecting a different pack moves the same details panel to its row; search, pagination and viewport resizing also maintain valid panel placement. The A2 variants, OAuth, local NAM loading, existing BLE model transfer and NAM validation logic are unchanged.

This update keeps the **`JamMate_Web_v2b/` deployment folder unchanged**, so the GitHub Pages OAuth redirect URI remains the one already used for v2b. Deploy files to the *existing folder*, not a new v2b-inline folder. `index.html` and `app.js` include simple asset-version query parameters to avoid old JavaScript/CSS remaining cached after deployment.

Changed files: `js/ui/NamBrowserV2b.js`, `css/nam-v2b.css`, `index.html`, `js/app.js`. Added `tests/nam-inline-harness.html` and `tests/test-inline.py` for isolated mocked-browser regression testing. No changes to the ESP protocol or TONE3000 API configuration.

Checks: node syntax, A2 API/transfer integration, browser mocked desktop/mobile expansion, switching packs, toggling open/closed, selecting A2 variants, disconnected BLE guard, search-and-reselect and resize all pass. Real TONE3000 account and actual ESP32 BLE transfer require live verification on your setup.
