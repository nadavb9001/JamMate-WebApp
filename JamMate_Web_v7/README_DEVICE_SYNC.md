# Device synchronization repair

## 7.14.1 connection reset hardening

The reported abort occurs during the configuration reply, before current state. The reply now streams flash bytes into a fixed 4,100-byte buffer, borrowed by the notification task until transmission completes. It no longer constructs String/vector copies or allocates a multi-kilobyte frame on the heap. Other replies use checked malloc and transfer ownership directly to the queue, removing the extra intermediate copy. Large sync buffers are kept off the Arduino loop stack. MTU and connection metadata are captured from GATT events instead of reading the server's changing peer map from the sender task. Task creation failures are checked.

Firmware reports `sync-recovery 7.14.1`. Boot/config/state/catalog logs include reset reason, available heap and stack minimum. PlatformIO monitor uses `esp32_exception_decoder` at 115200 baud to decode any subsequent backtrace against the matching local ELF. This hardening builds and passes host tests, but the physical reset must be retested on the ESP. The v7.14 web app remains compatible; do not erase LittleFS.

## 7.14 hardware follow-up

The first repair incorrectly used the new-write validator for old flash files. This caused preset switches to stick at an existing slot whose record widths differed. Flash reads now use a separate bounded legacy reader, preserving the stored knob/dropdown boundaries for known older layouts, leaving added fields at their defaults, and never rewriting the original file. New writes remain strictly validated. Navigation also advances past a genuinely corrupt slot on the next click. Legacy formats have no parameter-name/schema IDs, so verify the sound of older presets whose DSP parameter meanings changed before explicitly saving them.

Main-page and drum-page tempo changes now share one tempo path. Web BPM writes resend even when the cached value matches. Active drum/looper settings are mirrored in DRUM for deployed DSP builds that do not handle the standalone tempo command; no button/fill pulse is sent and stopped drums stay stopped.

BLE notifications no longer share the characteristic value buffer with incoming writes. The sender uses the SDK notification API and observes congestion; the receiver copies the write-event bytes. Initial configuration and state reads retry with bounded deadlines. All module imports are versioned to bypass old HTTP caches, and the service worker cache is v14. The Connection popup shows **JamMate v7.14**. Firmware boot logs show **sync-recovery 7.14**; handshake logs report client framing and the actual sent bank/slot/BPM/volume.


Deploy this complete v7 web folder together with the repaired JamMate_Ctrl firmware. Older firmware does not implement configuration readback or the framed transport; the web app blocks edits until the device configuration is verified. Do not mix these versions or deploy just app.js. The service worker cache version is updated.

The ESP remains the preset authority. Browser storage is a validated, read-only mirror of the 35 saved slots; unsaved live edits are separate. Connecting reads config (0x54/0x55), verifies version/order/counts, then reads current state (0x30/0x31), selection and controls, and requests the catalog (0x37/0x38). Missing/changed slots use 0x39/0x3A with CRC16. Catalog/slot requests have bounded retries. Periodic state reconciliation recovers dropped notifications; catalogs refresh every 30 seconds and after web saves.

Writes use application confirmation where persistence matters: preset load/save replies are 0x59, and config chunk ACK/NACK is 0x53. Config uploads are ordered, duplicate-safe, size/schema validated, written and read-verified to a temporary file, then renamed over the active file. Only after parsing does the final ACK carry the applied CRC; the browser then reads the exact text back before reporting success. Legacy counts-only uploads are rejected. Labels/options can be read from ESP, while the bundled DSP effect order and parameter counts must match before editing.

Both directions wrap logical messages in fragments:

```
7E 01 transaction:u16LE offset:u16LE total:u16LE crc16:u16LE payload...
```

The CRC covers the complete logical message. Maximum message size is 6,144 bytes; config text is capped at 4,096 bytes. Browser writes fit the minimum 23-byte ATT MTU; ESP notifications use the negotiated MTU. Assemblies expire after five seconds and reject gaps, inconsistent metadata and bad CRCs. ESP writes are queued onto its main loop; notifications have a separate ordered sender. Queued traffic from a previous connection is discarded.

Live selection/master/BPM uses 0x3F; effect changes use 0x20/0x21/0x36; EQ uses 0x22. The extended 0x3E controls payload contains, in order:

```
drumEnable level style pattern bpm loopEnable loopLevel(0..127)
sync autoArm bars track playback bounce muteMask soloMask fill tunerEnable bypass
```

Remote UI updates do not send control writes back. DSP BEAT packets are forwarded as 0x3C, and ESP selected-track loop status/progress as 0x3D. Tuner frequency remains Float32 little endian in 0x35. The looper display uses one 0..127 level internally, converting percentages at the DRUM boundary.

## Validate

With both repositories checked out as siblings (or set JAMMATE_CTRL_DIR):

```sh
cd /workspace/JamMate_Ctrl
PLATFORMIO_CORE_DIR=/workspace/.platformio /workspace/.venvs/jammate/bin/pio run -e esp32dev -j 4

g++ -std=c++17 -I include test/native/web-sync.cpp -o /tmp/jammate-sync
/tmp/jammate-sync

cd /workspace/JamMate-WebApp/JamMate_Web_v7
for test in tests/*.mjs; do node "$test" || exit; done
/workspace/.venvs/jammate/bin/python tests/device-sync-browser.py
/workspace/.venvs/jammate/bin/python tests/looper-eq-mobile.py
/workspace/.venvs/jammate/bin/python tests/fx-params-scroll.py
```

The cross-repository test compiles the actual firmware runtime helpers with host adapters, verifies config failure preservation and 35-slot serialization, and feeds those replies into the actual WebSync decoder. Browser tests exercise the real UI against a framed test peer. These are offline checks, not physical BLE/Daisy validation.

## Existing presets and remaining hardware checks

Back up LittleFS presets before upgrading; do not erase the filesystem. Startup no longer automatically formats a failed mount. Old files are read with their stored record widths and remain unchanged on flash. Structurally corrupt files are reported unreadable; the next switch click can move past them. New saves use the current canonical layout.

The selected DSP protocol reports selected-track state and first-loop duration, not independent state/playheads for every track. Looper phase remains the ESP display estimate, not a sample-accurate DSP position. The sequencer grid can mirror the last web-supplied grid during this boot, but the supplied DSP interface cannot read back an independently modified full grid. Controls reset according to existing firmware/DSP boot behavior; a reconnect restores the current ESP snapshot.

Still verify on hardware: first connection/reconnect with all 35 slots, physical and web edits while playing, low-MTU transfers, tuner notifications during preset/config transfers, dropped packets, A2DP coexistence, save-lock/write failures, power-cycle persistence, all looper buttons and quantization/auto-arm modes, drum auto-start, and real DSP beat/tuner delivery. No firmware flashing or filesystem upload was performed by the repair.
