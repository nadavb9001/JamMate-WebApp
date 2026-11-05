# JamMate v8.4.2

Use `JamMate_Web_v8/` with the v8 firmware `src/` and `include/` folders. The two projects are on `codex/jammate-v8`; v7 remains available separately. Build using the existing PlatformIO project, flash firmware, and deploy the complete web v8 folder. Do not erase or replace LittleFS. No PlatformIO configuration change is required.

Web and LCD layouts, artwork, styles, icons, and control arrangements are preserved. `js/config.js` is byte-identical to v7. The paged configuration read, schema checking, ordered upload, flash read verification, applied checksum, and configuration readback are retained. Expression ADC polling remains removed. Audio capture/MP3 recording is deferred at the user's request.

## 8.4.2 LCD FX parameter access

Firmware-only input fix; the web UI remains v8.4.1. On the LCD FX grid, rotate the navigation encoder to select an effect, short-press to toggle it, and long-press (over 800 ms, then release) to open parameters. In parameters, rotate to select a knob/dropdown, short-press to adjust, rotate to change its value, and short-press to finish. Long-press returns to the FX grid. Volume encoder short-press also opens parameters from the grid; its long-press returns Home from the grid. Volume rotation retains its global assignment. Stale volume-button holds are discarded in the parameter screen. Graphics and DSP protocol are unchanged.

## 8.4.1 Vintage reverb engine

The v8 config now matches the updated v7 config from GitHub: ReverbEngine is Dattorro (0), FDN (1), Vintage (2). ESP default config and fallback engine choices use the same order. Upload the bundled config from Setup after updating; existing LittleFS configuration is preserved until that explicit upload. Engine indices still use the existing preset/effect/DSP protocol. No DSP implementation or graphics change is included.

## 8.4 config upload and mismatch recovery

A GNRC 8-knob/2-dropdown device can establish BLE but cannot decode the 10-knob web layout safely. It now stays connected in configuration repair mode instead of failing the connection. Controls and automatic preset sync remain locked; use Setup's existing upload configuration action to repair it.

Uploads use an independent copy of the bundled `js/config.js`, so device-provided labels/options cannot overwrite the intended upload source. A single upload runs at a time, pauses normal sync, checks each acknowledgement and final applied checksum, and verifies the complete file by reading it back. Only then does the app request fresh state and restart preset synchronization. Readback during upload cannot start concurrent state/catalog transfers. Upload errors leave controls locked and explain the failure.

The ESP validates the complete configuration before writing it, applies it directly into its existing fixed display label pool without allocating per-line Strings or reading another whole-file copy, and reports success only after the runtime layout matches. The upload staging buffer is fixed at 4097 bytes. The file format, config.js, chunk protocol and DSP protocol are unchanged. Historical GNRC 8/2 presets preserve their dropdown values when loaded with the 10/2 layout; new knobs start at zero.

Deploy the complete v8.4 web folder and flash the matching firmware without erasing LittleFS. Check the console says `Web build v8.4`, connect, and if configuration repair is required use Setup to upload the bundled configuration. Software tests exercise the reported GNRC mismatch, upload/readback, normal sync and reconnect; physical ESP/phone validation is still required.

## 8.3 recover missing notifications without disconnecting on live state

The v8.2 hardware log reports `op=3e`, no matching ACK, no SDK notification errors and MTU 247. The SDK accepted submission; this does not prove the phone received/processed the notification. The exact phone-side cause remains unconfirmed. The code previously forced a disconnect after that missing state ACK.

V8.3 exposes bounded snapshots on the same RX and TX attributes via READ. RX returns the last transport ACK; TX returns the last DATA fragment. Both use the existing v8 packet format, CRC, session checks, reassembly and ACK path. The sender copies bytes into fixed buffers; only the BLE read callback writes the characteristic value, avoiding concurrent String access.

Readback runs only while a command/reply/partial transfer is pending and notifications have been quiet for 600 ms. It stops when the operation is complete; there is no idle readback polling. Reading enables a one-fragment ESP reply window for that connection, so a later fragment cannot overwrite an unread earlier one. A receiver that first sees a later fragment requests offset zero. Normal notification delivery retains the four-fragment window.

A missing ACK for a live-state push (controls, selection, CPU, EQ/effect, live preset or grid) is deferred without closing the link. The next accepted command requests a fresh snapshot. Config/catalog/slot/resource transfers still fail within bounded deadlines. Disconnect logs include the Bluetooth reason code. The web Connection popup retains the last connection error, so a phone user can read it without a developer console.

The browser requires the readback capability bit (HELLO window byte bit 7; low nibble remains window size). Update both firmware and web app. If the browser reports missing READ properties after flashing v8.3, forget/re-pair JamMate once to refresh the cached GATT database. The new READ properties are required; the configuration schema and sync mechanism remain unchanged.

Software validation includes normal notifications, all notifications suppressed, and only controls notifications suppressed, using the real looper screen checkbox and REC button. Normal mode additionally checks unsolicited CPU and physical parameter updates. If notifications are completely unavailable while idle, autonomous ESP changes require the next web operation or reconnect to recover; this is the consequence of avoiding idle polling. Physical phone/ESP validation is still required.

## 8.2 looper acknowledgement and reconnect repair

The supplied v8.1 log shows looper enable reaching the DSP, followed by an unacknowledged controls reply (operation 3E), disconnect, and eventually a Core 0 LoadProhibited crash on reconnect. The exact panic addresses could not be reliably attributed without the user's matching ELF. Source inspection found that the pinned Arduino BLE `notify()` implementation copies its unprotected peer map from the sender task while the Bluetooth task modifies that map on connection changes.

The firmware now sends through the SDK using the GATT interface captured from CREATE for the exact v8 service UUID and the connection ID captured from CONNECT. It does not guess the last registered interface, copy the library peer map, or allocate a characteristic String for each fragment. Packets from an old session are rejected before submission. SDK failures and the last accepted ACK are included in stall diagnostics. Incoming ACKs must match the active transaction, operation and sent offset range.

The browser prioritizes transport ACKs over queued DATA and sends ACK/HELLO with confirmed GATT writes. Bulk DATA retains write-without-response and the four-fragment window. GATT writes have a 2.5-second deadline; connection, discovery and notification subscription also have deadlines. A stalled write closes the connection, cancels queued work and starts bounded reconnect. Late completions cannot overwrite the new connection's handles.

Tests cover the real firmware SDK route with distinct interface/connection IDs, SDK failure, stale-session rejection, browser priority/confirmed ACK writes, never-resolving writes/discovery, stale completions, and full UI looper enable/REC concurrent with a controls reply. The phone-like browser peer rejects unconfirmed transport ACKs. Physical ESP/phone validation remains required; software checks do not prove the reported hardware crash is resolved.

## One BLE protocol

V8 uses a distinct service so a cached v7 device cannot be mistaken for v8:

- Service: `8a8e0001-8a8e-4800-8000-4a616d4d6174`
- RX command/ACK writes and ACK snapshot reads: `8a8e0002-8a8e-4800-8000-4a616d4d6174`
- TX data/ACK notifications and DATA snapshot reads: `8a8e0003-8a8e-4800-8000-4a616d4d6174`

Every packet has a 16-byte little-endian header:

| Offset | Field |
| --- | --- |
| 0 | magic `D8` |
| 1 | version `08` |
| 2 | DATA=1, ACK=2, HELLO=3 |
| 3 | operation |
| 4 | transaction u16, nonzero for DATA |
| 6 | byte offset u16; ACK contains next expected offset |
| 8 | complete payload size u16, maximum 2048 |
| 10 | CRC16/Modbus of complete payload |
| 12 | random browser session u32 |
| 16 | binary payload fragment |

HELLO is exactly 20 bytes, with payload `[8,4,244,0]`. The ESP replies with operation 0 and `[8, window | 0x80, ATT-size-u16]`. DATA/ACK use that session. A new GATT connection must establish a new session. No raw packets, old framing, JDY fallback, legacy counts uploads or old NAM/MIDI BLE transfer commands are accepted.

A four-fragment window and cumulative ACKs replace per-fragment round trips. Packet size follows the actual negotiated MTU (20 to 244 ATT bytes, leaving 4 to 228 payload bytes). Missing fragments resume from the receiver's offset; duplicate complete messages are not applied twice. Whole-message checksum failure restarts the message. Repeated critical-transfer stalls close the connection; stalled live-state pushes are deferred without tearing down the link. No fixed inter-chunk sleeps are inserted. The ESP requests a 7.5–15 ms connection interval; the host decides the actual interval and throughput. Hardware throughput has not been measured.

The browser serializes GATT operations, services ACKs independently of queued messages, and gives controls priority over bulk blocks. The ESP uses bounded queues and a fixed inbound command pool, avoiding heap allocation for incoming resource blocks. Queue/allocation failures trigger state reconciliation; an inbound command that cannot be queued is not acknowledged as accepted. Bulk data is binary, including little-endian float32 NAM weights. Whole-effect updates use operation `27` with `[effect, flat-count, enable, knobs..., dropdowns...]`; individual parameters still fit one minimum-MTU packet. The unused master byte and redundant DRUM text tag are removed from BLE control payloads. Compression is deliberately absent: it adds RAM/CPU cost and has uncertain benefit for dense model/IR bytes.

## Idle activity in v8.1

There is no 10-second browser keepalive and no periodic full state/catalog BLE resend. Beat (3C) and loop progress/status (3D) are neither sent by the ESP nor rendered in the web app. Drum/looper parameters and buttons remain available. The footer keeps the CPU meter and removes its beat indicator.

CPU load comes from real DSP LOAD samples, sent as operation 48 with a u16 in tenths of a percent. The ESP sends the first known sample on synchronization, then only changed values, at most once every two seconds. No CPU polling request is sent. A stable known CPU value produces no idle telemetry.

The ESP still compares local parameter state every 200 ms; unchanged state sends no BLE packets. A browser timer retries outstanding catalog/slot requests only. Transfer ACK/retry timers operate only while data is in flight. Existing DSP/LCD work and firmware state persistence remain independent of BLE.

## Connection and state

Connect → subscribe → HELLO → verify configuration → fetch current ESP state → ready. A drop cancels requests and queued writes. Reconnect uses bounded exponential backoff and repeats configuration/state synchronization; old session packets cannot apply to the new connection. Interrupted uploads are discarded; they are not replayed blindly.

The ESP owns current state and saved presets. Device and web edits share the existing application/DSP handlers. Selection, master, BPM, all effect enables/knobs/dropdowns, EQ, drum controls/grid, looper parameters, tuner, bypass, utilities, A2DP volume/enable, USB mode and UART status replicate to the web app. Saved slots are compared by checksum and only changed slots are fetched. Full snapshots occur on connection/reconnection or recovery after queue pressure; the 30-second full-state/catalog resend is removed. Catalogs refresh on connection, web preset saves and serial preset imports. Remote UI updates do not send edits back.

Domain records inside JS/C++ retain operation names and preset storage layout. Their local `[operation,length,payload]` representation is never sent directly over BLE; `Wire.js` and `JmV8.hpp` define the sole on-air format. Existing flash preset readers remain to preserve user files; these are storage readers, not alternate communication protocols.

The ESP↔DSP protocol definitions, packet layouts, UART rate, and existing control/NAM/MIDI messages remain intact. IR uses the already-defined JMP2 IR object type; it requires an actual DSP that implements that object. MIDI is forwarded in bounded batches between UI loop iterations, with padding only at the end of the file. Its preserved DSP protocol has no commit ACK, so its final success confirms verified receipt and forwarding by the ESP, not DSP persistence. USB status is the last ESP-issued mode, not independent DSP readback. Web beat/loop progress telemetry and indicators have been removed; LCD/DSP timing stays intact. A DSP-edited complete drum grid cannot be recovered through the existing DSP interface.

## One resource transfer engine

NAM, IR and MIDI share these operations. All integers are little endian:

- `90 BEGIN`: id:u32, kind:u8 (NAM=1, IR=2, MIDI=3), size:u32, CRC32:u32, items:u32, filename-length:u8, filename (1–64 bytes).
- `91 BLOCK`: id:u32, offset:u32, up to 1024 data bytes.
- `92 COMMIT` / `93 ABORT`: id:u32.
- `94 STATUS`: id:u32, status:u8, phase:u8 (begin=0, block=1, commit=2, abort=3), next-offset:u32.
- `95 READ`: id:u32, kind:u8, offset:u32, requested-size:u16.
- `96 READ_DATA`: id:u32, status:u8, kind:u8, total:u32, offset:u32, whole-file-CRC32:u32, data.

A resource is at most 128 KiB. NAM A2 Lite requires 1871 float32 weights. Uploads stage into LittleFS, enforce offsets, compare duplicate blocks, check size/CRC, and atomically rename the completed file. The DSP receives data only after complete-file verification. NAM/IR completion waits for the existing DSP commit response. Lost connections before commit discard the partial staging file; completed resources remain available for download. Only the latest completed resource of each kind is retained for browser readback.

The existing NAM and MIDI UI use this engine. The same API accepts IR bytes without adding new graphics:

```js
await BLEService.uploadResource('ir', bytes, 'cabinet.ir', {
  onProgress: (done, total) => console.log(done, total)
});
const bytesBack = await BLEService.downloadResource('ir');
```

IR bytes must match the connected DSP's accepted resource format; this code does not invent a DSP decoder or convert arbitrary WAV files.

## Verification and installation checks

With both repositories checked out as siblings:

```sh
cd JamMate_Ctrl
pio run -e esp32dev -j 4
cd ../JamMate-WebApp/JamMate_Web_v8
for test in tests/*.mjs; do node "$test" || exit; done
python tests/device-sync-browser.py
python tests/looper-eq-mobile.py
python tests/fx-params-scroll.py
python tests/three-theme-browser.py
python tests/visual-parity.py
```

Native cross-tests require `g++` and the firmware checkout, including its test directory. Browser tests require Playwright, Chromium and Pillow. The distribution ZIP contains only web v8 and firmware `src/` + `include/`.

Still validate on the physical ESP/Daisy: first connection and repeated drops, negotiated MTU/interval and actual throughput, A2DP coexistence, physical/web edits during transfers, repeated preset changes, IR support/format, and save/power-cycle persistence. Software tests and compilation do not establish physical BLE behavior.
