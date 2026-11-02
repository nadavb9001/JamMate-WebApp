# JamMate — synchronized ESP + three-theme webapp (2026-10-27)

## What this source update does

**Authority:** The ESP's loaded preset and saved preset files are authoritative. The Daisy is the timing/audio authority. The browser's preset cache is a read-only mirror, not an upload queue. This prevents an outdated browser from silently replacing a physical preset.

**First BLE connection:** the existing `0x30` GET_STATE / `0x31` STATE_DATA handshake loads the ESP's current preset in the browser. The browser then sends `0x37` GET_PRESET_CATALOG. The ESP reads all 7 × 5 = 35 saved preset slots from LittleFS (or synthesizes an unsaved default without writing flash) and returns a length-framed catalog `0x38` containing per-slot size and CRC16. The browser compares the catalog to its localStorage copies and fetches **every missing or modified slot**, one at a time, with `0x39` request / `0x3A` response. Downloads are validated before caching. On a subsequent connection, unchanged slots are not transferred. A failed/truncated response is retried at most twice. The sync never changes the playing preset or global volume. The initial copy may take several seconds depending on BLE conditions.

**Live state:** physical ESP preset loads and serial `load-` send the selected bank/slot and live `0x34` state blob. ESP-side effect toggles and parameter edits use the existing `0x21` and `0x20` notifications; the web now receives and applies them **without echoing a new BLE edit**. Web-origin effects, EQ, presets, looper commands, BPM, and volume still use existing paths. Master volume remains globally independent, starts at 20% each boot, and uses the explicit `0x26` command. New main-page BPM and master-value redraws are limited to their two tiles.

**DSP-driven animations:** Daisy `BEAT` 16-byte messages are forwarded with `0x3C`, including DSP bar index, beat index, beats-per-bar, sequence number, BPM×10 and sample counter. The web de-duplicates sequence numbers, estimates intra-beat pacing only from real sample differences, and stops displaying a running beat if incoming DSP messages cease. `LOOP` recording/closure notifications update the same ESP model as the display. The web receives ESP display progress/state/layers via `0x3D` at up to 8 Hz, with CSS interpolation between readings. When the DSP doesn't expose a true free-length audio playhead, both ESP and web share the same **estimated display animation**; this must not be treated as sample-accurate playback position. Tuner frequency comes only from Daisy `FREQ`, forwarded as the existing `0x35` message up to 8 Hz. CPU and shared drum/looper settings also refresh.

**BLE packet integrity:** all 0x31, 0x34, 0x38 and 0x3A length-framed transfers now use an exclusive notification mutex; beat/tuner packets cannot be inserted halfway through a preset blob. The web serializes GATT writes. Bulk notifications are chunked to 128 bytes; your BLE connection must support notifications of this size (the firmware requests MTU 517). Verify negotiated MTU on your phone.

## Wire IDs added

| ID | Direction | Payload |
| --- | --- | --- |
| `0x37` | Web → ESP | Request catalog, command byte only |
| `0x38` | ESP → Web | Length-framed `[version,count,(bank,slot,size16,crc16)*]` |
| `0x39` | Web → ESP | `[cmd,2,0,bank,slot]` request individual slot |
| `0x3A` | ESP → Web | Length-framed `[bank,slot,serializedPresetBlob]` |
| `0x3C` | ESP → Web | `[cmd,16-byte DSP BEAT data]` |
| `0x3D` | ESP → Web | `[cmd,looperState,layerCount,progress0to100-or255,loopMsLE16]` |
| `0x3E` | ESP → Web | Drum and Looper settings snapshot (12 bytes) |
| `0x3F` | ESP → Web | `[cmd,bank,slot,masterPercent,bpm]` |
| `0x48` | ESP → Web | `[cmd,DSP CPU percent]` |

ESP physical effect changes reuse existing unframed `0x20`/`0x21`; the web decoder now handles them. The previous `0x31`, `0x34`, `0x35`, `0x25`, `0x26`, `0x41`, `0x42` and `0x47` are retained.

## Installation

1. Keep a backup of your current ESP firmware, its LittleFS data, and the deployed webapp. **Do not erase LittleFS**, or your saved presets may be lost.
2. In the latest ESP project, replace `src/`, `include/` and any tests from the full ESP archive, using your existing board `platformio.ini`, TFT_eSPI pin configuration, libraries and filesystem image.
3. Build and flash the ESP. The ESP's Daisy connection and UART protocol remain compatible with the recent Daisy shared-transport / optimized looper firmware. No Daisy source change is part of this package.
4. Deploy the *entire* updated three-theme webapp to your HTTPS origin (or supported secure localhost) and refresh the service worker/PWA. Web Bluetooth requires a supporting browser and an explicit user connect action. The theme choice persists.
5. Connect the phone: the active preset should appear first, followed by a brief preset catalog sync status. Change a preset and an FX parameter from the ESP and from the phone, then test 3/4/6/8 beats, looper arm/start/play, tuner, and master volume.

### Verification checklist on hardware

- First connection with empty browser storage: all 35 slots transferred and cached; subsequent reconnect skips unchanged slots.
- Change one saved preset on ESP/serial and reconnect: only that slot should download (plus any other changed slots).
- Change ESP bank and preset via physical buttons while phone is connected: bank/number and all 18 FX parameters update. Do not change DSP sound twice.
- Turn ESP FX enable/knob/dropdown and web FX controls: both displays reflect the change; no feedback loop.
- Move BPM from either side and observe the real BEAT packets and 3/4/6/8 group counts. Stop drums: animation times out rather than free-running.
- Arm/record/play/stop Looper: ring and layers track the ESP state. Free-length phase without DSP anchor is a **visual estimate** on both displays.
- Activate Tuner: phone and ESP derive note/frequency from the same Daisy frequency stream.
- Set master volume to 38%, change effects/presets, verify it remains 38%; reboot → Clean 1, 20%.

## Final sync QA note

Live BPM updates from Daisy BEAT packets now pass through the same UI-update routine as ESP-origin BPM changes. This keeps the phone's visible BPM slider and number synchronized when transport tempo changes while connected, without sending the update back to the ESP.

## Tests and limitations

Passed: existing webapp Looper, global-volume, 3-theme, mobile, NAM, browser EQ/Looper regression tests; new Node integration test for all 35 slots/CRC/corruption/reconnect/retry/beat/loop/param; C++ host test for CRC/endian; ESP boot, incremental-Looper redraw, and volume source/host tests. The complete ESP build and real BLE/TFT/Daisy hardware timing have **not** been run in this environment because the archive omits project-specific `platformio.ini`, board and TFT_eSPI configuration. MTU negotiation, BLE radio contention with A2DP, and physical tuner/looper timing require on-device verification.
