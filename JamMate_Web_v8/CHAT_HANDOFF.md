# JamMate continuation handoff

Prepared 2026-11-07. This document transfers the project context to a new chat; it is not a request for another protocol redesign.

## Start here

Continue from **web v8.7.1 + ESP firmware v8.7**, on branch **`codex/jammate-v8` in both repositories**. Preserve the original BLE UUID topology and the current lightweight active-preset sync. The latest requested work before this handoff is complete and pushed. Await the user's next direction or investigate new hardware evidence; do not automatically undo or replace the current design.

Repositories/checkouts:

| Repository | Workspace | Last code-release commit pushed by this chat |
| --- | --- | --- |
| `nadavb9001/JamMate-WebApp` | `/workspace/JamMate-WebApp` | `615979abde340611c9f597021ff4714b799cc296` — web v8.7.1 |
| `nadavb9001/JamMate_Ctrl` | `/workspace/JamMate_Ctrl` | `5d69e5cda75cc7d1dbc47668b391e8a695d2bfdd` — firmware v8.7 |

The handoff itself is a later documentation-only commit. Fetch and inspect the branch/worktree before further edits; the user may have made newer changes. Do not reset user changes or assume `main` is the current implementation. No merge to `main` or GitHub Pages deployment was performed by this chat.

Active web directory: **`JamMate_Web_v8/`**. Root-level and older version directories contain older apps and must not be mistaken for the current app.

Latest scoped package:

[JamMate-v8.7.1.zip](https://github.com/nadavb9001/JamMate-WebApp/raw/615979abde340611c9f597021ff4714b799cc296/downloads/JamMate-v8.7.1.zip)

- Local: `/workspace/JamMate-WebApp/downloads/JamMate-v8.7.1.zip`.
- SHA256: `90aefbcaa2575481c427d31aca01143d9678abf32c7a38d364a547ff8cb8aac3`.
- Includes only `JamMate_Web_v8/`, `JamMate_Ctrl/src/`, `JamMate_Ctrl/include/`.
- Firmware in this package is byte-identical to v8.7. Updating v8.7 to v8.7.1 requires only the web folder.
- Console should report `Web build v8.7.1`; ESP boot reports `v8.7 active-preset sync ready`.

## User constraints that must persist

1. **Do not change web or LCD graphics, styling, artwork, or control placement.** Functional input/sync fixes are allowed. Preserve the LCD editing fix described below.
2. **Keep the Daisy DSP communication/protocol intact.** Do not replace its UART/JMP2 mechanisms as part of BLE work.
3. Deliver code packages containing only the web v8 folder and ESP firmware `src`/`include`. Do not send whole repository archives with old apps or PlatformIO build output.
4. **Do not erase or replace LittleFS** when flashing. Preserve existing presets/custom configuration. Config updates are explicitly initiated by the user.
5. Retain the bundled `config.js` and consistent effect definitions. Reverb engine choices are **Dattorro = 0, FDN = 1, Vintage = 2**.
6. Audio recording/MP3 work is deferred. The user explicitly said to omit audio writing/capture for now. Do not silently add it.
7. Expression-pedal ADC polling/printing was removed at the user's request; do not restore it.
8. Drum/looper beat indicators and live loop/beat streams were removed from the web to reduce BLE load. Do not restore them.
9. Avoid unnecessary confirmation questions. The existing workflow commits/pushes authorized changes to `codex/jammate-v8`, not `main`.
10. Hardware/phone validation has **not** been performed. Do not describe mocked browser/native tests as physical BLE, audio, or DSP validation.

## Current agreed BLE design

The user rejected an increasingly complex binary session/config-sync design, requested restoration of the original topology, and then approved a small two-way sync layer for selected presets and knobs.

Original topology remains:

- Service: `6e400001-b5a3-f393-e0a9-e50e24dcca9f`.
- One shared control characteristic: `6e400002-b5a3-f393-e0a9-e50e24dcca9f`.
- Baseline WRITE/WRITE_NR/READ/NOTIFY properties; current web uses confirmed writes and subscribes to notifications on this same characteristic.
- **No separate TX characteristic, no private `8a8e...` service, no config handshake/download, no config-CRC handshake, and no bank/catalog download.** Do not reintroduce these discarded designs as a fix.
- Web commands retain the baseline raw record: command byte, payload length uint16 LE, payload. Writes are serialized in 20-byte pieces, with bounded ESP stream assembly.

ESP is authoritative for the **active bank/slot, preset name, effect enables, knobs/dropdowns, BPM, master volume and EQ**. On connection/reconnection the web requests one active-state snapshot. Physical and web changes update the same ESP state and generate small change-only messages. Web application of received changes must be silent: **no parameter or EQ echo writes**.

The ESP compares active state every **40 ms**, coalescing rapid changes. Small changes generate 10-byte notifications (14 for EQ); selection changes or larger groups produce a snapshot. Frozen snapshots finish before later parameter differences are emitted. No application-level heap allocation or blocking ACK waits are used by this state sender.

The web checks the revision every **five seconds**, only when connected and not busy writing/uploading. Request/reply are five/eight bytes. This intentionally small idle exchange detects a lost final delta. No periodic full-state refresh, config polling, CPU feed, tuner feed, or beat streaming is enabled.

### Current sync messages

- Web `0x5c`: active snapshot request; payload is a two-byte correlation token.
- Web `0x5d`: revision request; same token payload.
- ESP notifications start with `0xa7`:
  - Type 1: snapshot fragment: tag, type, token16, revision32, offset16, total16, CRC16, data. Header is 14 bytes.
  - Type 2: delta: tag, type, revision32, effect/domain ID, kind, index, value (or five EQ bytes).
  - Type 3: revision reply: tag, type, token16, revision32.
- Snapshot body: bank, slot, 36 bytes of effect knob/dropdown counts, then the existing v3 preset blob. Counts describe serialization, not config labels/options; they do not replace web `config.js`.
- Web parameter builders still expose flat indices, but BLE sends `0x28` typed parameters: effect, enable/knob/dropdown kind, index, value. ESP translates to its own layout and existing DSP path. Original `0x20` flat commands remain accepted.
- This typed mapping prevents an 8-knob versus 10-knob layout from shifting dropdown values into knob fields. Both supplied configs currently match across all 18 effects.

Snapshot packets use negotiated ATT payload, capped at 244 bytes. Minimum-MTU packets are 20 bytes. Snapshots are bounded to 1100 bytes, CRC-checked, token-correlated and revisioned. SDK submission errors retry the same fragment with bounded backoff. The SDK notification path uses the actual GATT interface/connection ID, avoiding Arduino BLE's unsafe peer-map-copy notification implementation.

### Fault recovery

- Ignore duplicate/old deltas; request active state on a revision gap.
- A revision mismatch repairs missing updates even if no later change occurs.
- Discard malformed/conflicting/CRC-invalid snapshots; bounded retries rather than GATT disconnection.
- First snapshot response deadline: five seconds; fragment stall timeout: two seconds; total assembly bound: twenty seconds. At most three snapshot attempts per recovery cycle; a later revision-check cycle can retry again.
- Snapshot deadlines start after the command is written, not while waiting behind an upload.
- Ordinary rejected writes are not replayed. After 2.2 seconds (allowing partial raw input to expire), the client makes a bounded recovery attempt and fetches ESP state. Staged resource transfers can be aborted on the same connection.
- A genuinely stalled OS GATT write is reported as requiring explicit reconnect; do not replay uncertain one-shot commands or force protocol-error disconnects.
- Physical disconnect clears old partial state; existing advertising/reconnect logic remains.

## v8.7.1 changes already completed

These are web-only fixes, verified by regression tests:

- Starting/completing a snapshot cancels any older revision-check timeout, preventing an unnecessary follow-up snapshot.
- Identical repeated snapshot fragments are ignored, including repeated prefixes/middle fragments, without extending the assembly deadline. Conflicting bytes still cause recovery.
- Async failures from an older sync run cannot cancel a restarted run.
- Failed/cancelled notification subscriptions remove their listeners.
- An interrupted resource upload schedules an abort only for the connection epoch that started it; stale failures cannot affect a newer link.

## Configuration, files, and UI behavior

- `app.config` and `app.bundledConfig` are independent copies of `APP_CONFIG`. ESP messages do not replace the web's labels/options or its config upload source.
- **Setup → Upload Config** is explicit web-to-ESP transfer. ESP validates all 18 rows, verifies/atomically replaces the file, applies the fixed label pool and refreshes LCD state. Existing custom config is preserved until this action.
- Config/resource uploads currently report **sent**, not verified/applied by the device. Do not restore old config ACK/readback protocols implicitly.
- NAM/IR/MIDI still use serialized staged uploads with ESP-side offset/size/CRC checks before application. No file-completion protocol was added to active-preset sync.
- Old backing web controls are hidden before first paint. The unused easy-popup script was removed. Do not revive the old GUI flash.
- Visible FX controls update silently; avoid rebuilding hidden legacy widgets on every incoming mobile knob update.
- LCD FX grid: rotate navigation to select; short press toggles; hold over 800 ms then release opens parameters. In parameters: rotate selects, click enters adjustment, rotate changes value, click finishes, long press returns to grid. Volume short press is alternate entry; volume long press on the grid goes Home. Volume rotation stays global.

## Important source locations

ESP (`/workspace/JamMate_Ctrl`):

- `include/BluetoothManager_binary.hpp`: original GATT topology, raw command input, bounded SDK sync notification path. General legacy send/reply adapters remain disabled intentionally; do not enable them globally and accidentally restore all old traffic.
- `include/BaselineBleStream.hpp`: raw record assembly/reset/timeout.
- `include/ActivePresetSync.hpp`: change detection, revisions, typed parameter mapping.
- `include/WebSyncRuntime.hpp`: config upload/file helpers and active snapshot/delta scheduling.
- `src/main.cpp`: main-task command processing, `0x28`/`0x5c`/`0x5d`, early sync service during DSP startup.
- `src/DisplayData.cpp`, `include/JmDefaultConfig.hpp`, `include/FxConfigApply.hpp`: consistent compiled/default/runtime FX definitions, including Vintage.
- `include/PresetBlobReader.hpp`: historical preset widths, including GNRC 8/2; preserve compatibility without rewriting files on read.
- `src/DisplayManager_Fx.cpp`: LCD parameter-entry fix.

Web (`/workspace/JamMate-WebApp/JamMate_Web_v8`):

- `js/services/BLEService.js`: raw writes, original UUID, notification subscription, lifecycle/recovery.
- `js/services/ActiveSync.js`: snapshot assembly, CRC/revisions, five-second checks, deduplication and recovery.
- `js/services/Protocol.js`: command/preset encoding; optional incoming snapshot layout for decoding.
- `js/services/Resources.js`: explicit staged resource uploads, connection-epoch abort guard.
- `js/app.js`: apply active snapshots/deltas to local UI without echoing, explicit uploads.
- `js/ui/mobile-shell.js`, `js/ui/CustomSelect.js`: visible control refresh; preserve graphics.
- `index.html`, `sw.js`: first-paint handling and versioned cache/module graph.
- `README_DEVICE_SYNC.md`: current install/protocol behavior, not the superseded architectures.

## Validation performed and limits

Passed:

- ESP v8.7 PlatformIO build.
- Native change detection, typed mapping, raw stream/config/file tests.
- **Actual native ESP-generated packets decoded by web code**, including minimum ATT size, active selection, Vintage and idle silence.
- Browser tests with the real UI and a fake framed/device peer: physical/web knob changes, selected preset changes, visible slider refresh, no echo writes, lost final delta, dropped snapshot fragments, transient write recovery, config upload, sparse revision checks and physical reconnect.
- v8.7.1 regression tests for stale timers, duplicate/conflicting fragments, subscription cleanup and stale upload epochs.

Not validated: actual phone/ESP radio behavior, hardware timing/throughput, real audio/DSP operation, or firmware flashed to the user's device. Earlier user logs showed allocation aborts, old/incompatible preset layouts and BLE reconnect panics in superseded releases; do not claim their exact hardware root cause was proven or that current hardware failures are resolved without fresh logs/matching firmware.

## Commands in the existing environment

Tools verified present: Node 24, g++, `/usr/bin/chromium`, PlatformIO/Python in `/workspace/.venvs/jammate`, PlatformIO core directory `/workspace/.platformio`.

Firmware:

```bash
PLATFORMIO_CORE_DIR=/workspace/.platformio /workspace/.venvs/jammate/bin/pio run \
  -d /workspace/JamMate_Ctrl -e esp32dev -j 4
```

Web/native suite (run from `/workspace/JamMate-WebApp/JamMate_Web_v8`):

```bash
for test in tests/*.test.mjs tests/looper-packets.mjs tests/nam-v2b-integration.mjs; do
  node "$test" || exit
done
```

Browser:

```bash
/workspace/.venvs/jammate/bin/python tests/active-browser.py
JAMMATE_TEST_MIN_ATT=1 /workspace/.venvs/jammate/bin/python tests/active-browser.py
```

Key tests: `active-sync.test.mjs`, `active-recovery.test.mjs`, `connection-recovery.test.mjs`, `active-cross.test.mjs`, `baseline-native.test.mjs`, `config-parity.test.mjs`, `fx-input.test.mjs`.

Managed Cloud sandbox may reject g++/Chromium subprocesses with EPERM. Use the normal approved execution escalation when required; this is not a protocol test failure. Follow the current cloud runtime skill for network/proxy/credentials. Do not expose credentials or bypass proxy policy.

In a fresh environment, select/clone both repositories at `codex/jammate-v8`. The old workspace paths and temporary test logs may not persist. Read any current repository/skill instructions and inspect working trees before edits. Do not assume access to physical hardware or an attached serial device.

## Remaining work / next useful input

No uncompleted authorized code change is pending. The next useful step is the user's physical ESP/phone test of web v8.7.1 with firmware v8.7. For a new fault, capture exact web build, ESP boot version, serial connection/error output, and the action that triggers it. Preserve the minimal design while reproducing the specific fault.

An earlier request to add `nadavb9001/bypass` to the environment encountered HTTP 403 and was not completed at that time. Do not assume this repository is installed or configured; revisit only if needed/requested.

## Suggested opening message in the new chat

> Continue the JamMate project using this handoff. Inspect `codex/jammate-v8` in both repositories. Current release is web v8.7.1 with ESP firmware v8.7. Keep the original UUIDs, minimal active-preset sync, graphics, DSP protocol, Vintage and existing LittleFS data. Do not restore config handshakes, bank sync or beat/CPU streaming. Read the current README and tests, then address my next request using this context.
