# JamMate v8

Use `JamMate_Web_v8/` with the v8 firmware `src/` and `include/` folders. The two projects are on `codex/jammate-v8`; v7 remains available separately. Build using the existing PlatformIO project, flash firmware, and deploy the complete web v8 folder. Do not erase or replace LittleFS. No PlatformIO configuration change is required.

Web and LCD layouts, artwork, styles, icons, and control arrangements are preserved. `js/config.js` is byte-identical to v7. The paged configuration read, schema checking, ordered upload, flash read verification, applied checksum, and configuration readback are retained. Expression ADC polling remains removed. Audio capture/MP3 recording is deferred at the user's request.

## One BLE protocol

V8 uses a distinct service so a cached v7 device cannot be mistaken for v8:

- Service: `8a8e0001-8a8e-4800-8000-4a616d4d6174`
- RX command/ACK writes: `8a8e0002-8a8e-4800-8000-4a616d4d6174`
- TX data/ACK notifications: `8a8e0003-8a8e-4800-8000-4a616d4d6174`

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

HELLO is exactly 20 bytes, with payload `[8,4,244,0]`. The ESP replies with operation 0 and `[8, window, ATT-size-u16]`. DATA/ACK use that session. A new GATT connection must establish a new session. No raw packets, old framing, JDY fallback, legacy counts uploads or old NAM/MIDI BLE transfer commands are accepted.

A four-fragment window and cumulative ACKs replace per-fragment round trips. Packet size follows the actual negotiated MTU (20 to 244 ATT bytes, leaving 4 to 228 payload bytes). Missing fragments resume from the receiver's offset; duplicate complete messages are not applied twice. Whole-message checksum failure restarts the message. Repeated stalls close the connection instead of silently losing data. No fixed inter-chunk sleeps are inserted. The ESP requests a 7.5–15 ms connection interval; the host decides the actual interval and throughput. Hardware throughput has not been measured.

The browser serializes GATT operations, services ACKs independently of queued messages, and gives controls priority over bulk blocks. The ESP uses bounded queues and a fixed inbound command pool, avoiding heap allocation for incoming resource blocks. Queue/allocation failures trigger state reconciliation; an inbound command that cannot be queued is not acknowledged as accepted. Bulk data is binary, including little-endian float32 NAM weights. Whole-effect updates use operation `27` with `[effect, flat-count, enable, knobs..., dropdowns...]`; individual parameters still fit one minimum-MTU packet. The unused master byte and redundant DRUM text tag are removed from BLE control payloads. Compression is deliberately absent: it adds RAM/CPU cost and has uncertain benefit for dense model/IR bytes.

## Connection and state

Connect → subscribe → HELLO → verify configuration → fetch current ESP state → ready. A drop cancels requests and queued writes. Reconnect uses bounded exponential backoff and repeats configuration/state synchronization; old session packets cannot apply to the new connection. Interrupted uploads are discarded; they are not replayed blindly.

The ESP owns current state and saved presets. Device and web edits share the existing application/DSP handlers. Selection, master, BPM, all effect enables/knobs/dropdowns, EQ, drum controls/grid, looper controls/status, tuner, bypass, utilities, A2DP volume/enable, USB mode and UART status replicate to the web app. Saved slots are compared by checksum and only changed slots are fetched. There is periodic full reconciliation, plus recovery after queue pressure. Remote UI updates do not send edits back.

Domain records inside JS/C++ retain operation names and preset storage layout. Their local `[operation,length,payload]` representation is never sent directly over BLE; `Wire.js` and `JmV8.hpp` define the sole on-air format. Existing flash preset readers remain to preserve user files; these are storage readers, not alternate communication protocols.

The ESP↔DSP protocol definitions, packet layouts, UART rate, and existing control/NAM/MIDI messages remain intact. IR uses the already-defined JMP2 IR object type; it requires an actual DSP that implements that object. MIDI is forwarded in bounded batches between UI loop iterations, with padding only at the end of the file. Its preserved DSP protocol has no commit ACK, so its final success confirms verified receipt and forwarding by the ESP, not DSP persistence. USB status is the last ESP-issued mode, not independent DSP readback. Looper telemetry still reflects the selected track; independent per-track DSP state and a DSP-edited complete drum grid cannot be recovered through the existing DSP interface.

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
