# JamMate v8.7.1 — lightweight active-preset sync

The original topology stays intact: service `6e400001-b5a3-f393-e0a9-e50e24dcca9f`, one shared control characteristic `6e400002-b5a3-f393-e0a9-e50e24dcca9f`. The web uses confirmed, serialized writes and subscribes to notifications on that same characteristic. No separate TX service/characteristic, config handshake, config download, preset-bank catalog, CPU/tuner feed or drum/looper beat stream is added. Graphics and DSP protocol are unchanged; Vintage remains reverb engine index 2.

## 8.7.1 web recovery fixes

Update the web directory; the existing v8.7 ESP firmware is unchanged and compatible. A completed/requested snapshot cancels an older revision-check timeout, preventing unnecessary follow-up downloads. Identical duplicate snapshot fragments are ignored without extending the transfer deadline; conflicting duplicate bytes still trigger recovery. Async failures from a previous sync run cannot cancel the new run. Failed/cancelled notification subscriptions remove their listeners. An interrupted resource upload only schedules an abort for the connection that started it, so stale failures cannot affect the next connection.

Regression tests reproduce these cases. All original v8.7 sync behavior, UUIDs, graphics and configuration remain unchanged.

## State and traffic

The ESP is authoritative for the active bank/slot, preset name, effect enables, knob/dropdown values, BPM, master volume and EQ. After connecting/reconnecting the web requests one active-state snapshot. Physical and web changes follow the same state path. Received updates change the web display silently, including visible parameter controls and EQ, without echoing writes.

The main task compares active state every 40 ms, coalescing rapid knob movement to the latest value. A changed parameter produces a 10-byte notification (14 bytes for an EQ point); unchanged state produces no notifications. Preset changes or larger groups of changes produce one current-state snapshot. No flash preset catalog is scanned/downloaded. Snapshot contents are frozen while transmitting, then subsequent changes are sent, so sustained parameter movement cannot prevent completion.

Each change carries a uint32 revision. The web requests a small revision check every five seconds while connected and otherwise idle (five-byte command, eight-byte reply). It skips checks during queued writes/file uploads. A missed final notification is therefore repaired even when nothing else changes. Duplicate/old deltas are ignored; gaps request a fresh active snapshot. Revision checks never read configuration.

Snapshots carry a request token, revision, bounded offset/total and CRC16, with at most 1100 bytes of assembled state. They contain only the active preset, including serialization counts for its parameters; they do not replace web config.js. ESP packet sizes use the negotiated ATT payload, capped at 244 bytes; minimum-MTU peers use 20-byte packets. Snapshot sends are paced and use fixed buffers. The SDK notification path avoids Arduino BLE's unprotected peer-map notify implementation. There is no TX task, blocking ACK wait or per-change heap allocation.

## Recovery

Missing, malformed or corrupt snapshots are discarded and retried at most three times per recovery cycle. The first reply has a five-second deadline; once fragments arrive, a two-second stall timeout and twenty-second total assembly bound apply. Transient SDK submission failures retry the same fragment with bounded backoff. A later five-second check can retry if synchronization remains unavailable. Requests are timed only after they have actually been written, not while queued behind file uploads. Notification/sync faults do not disconnect GATT. Reconnect discards old partial snapshots and fetches current state again.

An ordinary rejected GATT write is not replayed. After 2.2 seconds, allowing an incomplete raw command to expire on the ESP, the web makes a bounded attempt to resume and fetch current state; staged resource uploads are aborted where appropriate. This restores the actual ESP value after a failed optimistic web edit. A genuinely stalled OS GATT operation is reported and requires an explicit reconnect rather than risking a delayed write corrupting a new command. Physical link loss uses the existing reconnect path.

## Commands and configuration

The baseline raw record remains command + uint16 payload length + payload. Web parameter builders retain their flat UI API, but v8.7 sends typed `0x28` parameters (effect, enable/knob/dropdown kind, index, value). The ESP translates them into its own layout before using the existing DSP parameter path. Different knob counts cannot shift a dropdown into a knob field. Original `0x20` flat commands remain accepted for older control clients. Whole preset save/load formats and the Daisy protocol remain unchanged.

`0x5c` requests an active snapshot; `0x5d` requests the current revision. Both have a two-byte correlation token. ESP notifications start with `0xa7`: type 1 snapshot fragment, type 2 parameter change, type 3 revision reply. Snapshot metadata is 14 bytes; small deltas fit the minimum ATT size. These packets are application state updates, not a transport ACK/retransmission protocol.

Configuration and NAM/IR/MIDI uploads stay explicitly initiated, serialized batches. Config validation, atomic flash replacement and resource CRC staging remain intact. The web reports bytes sent; v8.7 does not restore config/resource completion acknowledgements or readback verification. Existing custom ESP config remains until explicitly uploaded. Both bundled defaults agree across all 18 effects, including Dattorro, FDN and Vintage.

## Install and validation

Update the complete `JamMate_Web_v8/` directory plus firmware `src/` and `include/`, rebuild/flash using the existing PlatformIO project, and confirm `Web build v8.7.1`. Install v8.7 firmware when upgrading from an older firmware revision; existing v8.7 firmware needs no reflash. Do not erase LittleFS. LCD navigation/parameter editing fixes, the startup GUI-flash fix and deferred audio recording are preserved.

Software tests cover native change detection and idle silence, actual ESP-generated packets decoded by the web at minimum MTU, checksum/revision handling, typed parameter mapping, physical/web changes without echo, active preset changes, visible control refresh, missing final deltas, dropped snapshot fragments, transient write recovery, config upload and physical reconnect. Physical ESP/phone validation remains required.
