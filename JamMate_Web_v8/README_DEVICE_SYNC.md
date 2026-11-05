# JamMate v8.5

Use the complete `JamMate_Web_v8/` directory and matching firmware `src/` and `include/` directories from `codex/jammate-v8`. Rebuild/flash using the existing PlatformIO project. Deploy the whole web directory and confirm `Web build v8.5`. Do not erase LittleFS. Both peers must be updated for this BLE protocol revision. LCD/web graphics and the Daisy DSP protocol are preserved. Expression ADC polling remains removed; audio capture/MP3 recording remains deferred.

## Connection and recovery

The handshake payload is only a four-byte CRC32 of the configuration. Both sides calculate IEEE CRC32 over the same effective config contents: `Protocol.buildConfigText(config.js)` on the web, actual persisted `/config.json` bytes on the ESP. JavaScript formatting/comments do not change this effective-config checksum. The ESP refreshes its checksum at boot, after a successful upload, and when config pages/digest are requested. Console output reports both checksums.

The existing bounded binary frame carries session identity, message/fragment offsets and CRC16. HELLO header fields carry transport window and ATT size; the only payload is config CRC32. The browser requests current state after this exchange. Equal checksums skip the full config download. Different checksums request the complete ESP config in explicit, browser-paced pages of up to 512 bytes, checked against CRC32. There are no unsolicited config pages, automatic config uploads or repeated idle config checks.

ESP config is the authority for its display/processing. The web always keeps its own bundled `config.js` for its interface and outgoing values. Downloading the ESP config stores a separate device description; it cannot overwrite the web config. Different counts, labels or dropdown choices do not block controls or disconnect BLE. Config download failure is reported separately while controls remain usable.

A transport fault resets the application session to state 0, cancels stale work and retries without closing GATT. In state 0 the web sends a checksum HELLO every 200 ms with no overlapping writes. The ESP sender task probes every 200 ms while physically connected, independently of blocking DSP/file work, carrying the failed session's identity so delayed probes cannot reset a newer session. Repeated HELLO requests for the same session are idempotent. A fresh session discards old commands/ACKs; current state/preset catalog are read again after recovery. Corrupt transfers have bounded retries, including whole-message CRC rollbacks. Queue/memory faults also reset the session rather than acknowledging lost commands.

After physical radio/OS loss the ESP advertises; the browser retries GATT every 200 ms between attempts. The ESP is a BLE peripheral and cannot initiate a central connection. Neither side deliberately disconnects for protocol/config errors; the web's explicit Disconnect button remains available. Browser/OS GATT operations have deadlines, so a single unanswered operation cannot produce overlapping reconnect attempts indefinitely.

Normal notifications use a four-fragment window with confirmed, prioritized transport ACKs. Bulk writes retain write-without-response. If notifications are missing, only active transfers use bounded characteristic readback; after detecting loss it polls at 20 ms between completed reads, never overlapping GATT operations. The ESP then uses a one-fragment reply window. Idle sessions send no pings/readback/config traffic. CPU updates remain changed-only/rate-limited; drum/looper beat and live loop telemetry remain removed from the web.

## Parameters, presets and files

BLE parameter messages identify effect, enable/knob/dropdown kind, index and value. Whole effects carry separate knob/dropdown counts. BLE presets carry an explicit 18-effect layout envelope around the unchanged stored v3 preset blob. This prevents a GNRC 8/2 versus 10/2 discrepancy from shifting dropdowns into knob fields. Receivers map common parameters into their own layout, safely ignore unavailable indices, and keep their own labels/options. Preset catalog CRCs refer to the original stored blobs. Stored historical presets remain readable; no flash file is rewritten merely by reading it.

NAM/IR/MIDI retain the shared staged, offset-checked, CRC32-verified resource engine. Config updates, presets and resources use the same BLE fragment/ACK engine. DSP wire formats and processing are unchanged.

## Explicit configuration updates

Use **Setup → Upload Config** to replace the ESP config with the web's bundled file. Only this action uploads configuration. It waits for an outstanding config read, pauses normal preset sync, and sends ordered chunks of up to 1024 bytes. Chunks are validated/acknowledged; the final ACK includes an applied CRC16. The browser then requests the persisted CRC32 and exact full readback before restarting state/preset sync. Duplicate upload clicks share one transaction. A session change aborts the old upload; retry explicitly from chunk 0. Interrupted/invalid uploads cannot append across sessions, and invalid text or flash-write errors preserve the previously committed file. A failed upload does not lock normal controls.

The ESP validates all 18 effect rows before writing, verifies the temporary file, atomically renames it, and applies the text directly into the fixed label pool. Success is acknowledged only after the runtime layout matches. No growing config String, duplicate whole-file read or per-line allocation is needed during apply.

The supplied web config, ESP default file, compiled fallback counts, labels and every dropdown option agree across all 18 effects. Reverb engines are **Dattorro (0), FDN (1), Vintage (2)**. Existing custom ESP config files remain intact until an explicit upload; upload once to install these bundled defaults on a device with older data.

## Startup and LCD controls

Backing web controls are hidden in inline CSS before first paint. Only the current mobile shell is shown; the unused old easy-popup script is removed. Current artwork, styling and control placement are unchanged.

On the LCD FX grid: rotate navigation to select, short-press to toggle, hold over 800 ms then release to open parameters. In parameters: rotate to select, click to adjust, rotate to change, click to finish; long-press returns to the grid. Volume short-press also opens parameters from the grid; volume long-press on the grid returns Home. Volume rotation remains global.

## Validation

Node/native tests exercise CRC parity, all 18 compiled/default configs, semantic parameter mapping, preset envelopes, historical flash files, bounded corruption handling, priority/serialized GATT operations, state-0 probes, idempotent handshake, queue failure without disconnect, interrupted/repeated config uploads, flash failures and staged file transfers. Chromium tests cover equal checksums without config download, mismatched/corrupt config without blocking controls, explicit config update, no-notification readback, ESP-initiated reset and lost-write-ACK recovery on the same GATT link, physical reconnect, idle silence, CPU/looper controls and first paint with JavaScript unavailable. Physical ESP/phone validation is still required.
