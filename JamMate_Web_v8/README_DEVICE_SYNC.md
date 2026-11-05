# JamMate v8.6 — baseline BLE topology

The original service and single shared characteristic are restored:

- Service: `6e400001-b5a3-f393-e0a9-e50e24dcca9f`
- Control characteristic: `6e400002-b5a3-f393-e0a9-e50e24dcca9f`

There is no separate TX characteristic. The GATT characteristic retains the baseline WRITE, WRITE_NR, READ and NOTIFY properties, but the web app only writes and the ESP sends no application notifications. The web app never subscribes or reads.

The CRC/session handshake, config download, state/catalog/preset synchronization, transport ACKs, readback recovery, status/CPU/tuner updates and periodic BLE probes are removed. Connection and physical reconnect perform service/characteristic discovery only and generate no application traffic. Physical disconnection restarts ESP advertising and the browser retries the original service. The browser has no idle BLE timer.

Commands use the baseline binary record: command byte, uint16 little-endian payload length, payload. FX parameters use the original flat enable/knob/dropdown indices. Stored preset blobs and the Daisy DSP protocol are unchanged. The web serializes confirmed GATT writes in 20-byte pieces so minimum-MTU peers can accept larger records. The ESP assembles bounded records without an extra envelope and processes them through the existing main-task command queue. A disconnect clears partial records; an abandoned partial record expires after two seconds. A write failure is reported without replaying commands or automatically closing BLE; disconnect/reconnect before sending again so a partial record cannot affect subsequent commands.

Preset load/save, FX, drums, looper and other control writes remain available. The web interface reflects its own controls and does not track physical ESP changes or fetch the ESP's current preset/parameters. CPU/tuner/readback displays receive no device updates in this mode. SD/device-list reads cannot return data.

**Setup → Upload Config** still sends the bundled web configuration to the ESP. The ESP validates and atomically stores it, applies its fixed label pool, refreshes the LCD and prints the outcome to Serial. No config ACK, checksum, file or applied status is returned to the browser. The browser reports that bytes were sent, not that the ESP applied them. Config/file batches cannot interleave with other web commands.

NAM/IR/MIDI uploads retain ESP-side staging, offset/size checks and CRC32 validation before DSP application. Their completion/error is not returned over BLE; the web reports only that the upload was sent. Invalid/incomplete config/files do not replace the last committed file.

Graphics, startup-flash prevention, LCD input fixes and all 18 consistent effect configurations remain. Reverb engines are **Dattorro, FDN, Vintage**. Existing custom ESP configuration remains until explicitly uploaded. Audio recording and expression ADC polling remain deferred/removed as before.

Update the complete `JamMate_Web_v8/` directory and firmware `src/` and `include/` folders from `codex/jammate-v8`, rebuild/flash with the existing PlatformIO project, and confirm `Web build v8.6`. Do not erase LittleFS. If the phone caches the previous v8 service, forget/re-pair JamMate once to discover the restored UUIDs.

Software validation covers the actual raw-record assembler, ordered confirmed writes, original UUIDs, zero connect/idle/reconnect application traffic, no read/subscription calls, config validation/preservation, file staging, Vintage, looper commands and physical reconnect. Physical ESP/phone testing is still required.
