# JamMate BPM sync fix — 23 October 2026

## Root cause
The phone BPM slider used BLE `SET_GLOBAL` (0x25), and the ESP forwarded that to `GEN ` only. The active Daisy drum engine follows `JmTransport` and receives tempo via `TCTL` operation 1. The ESP's own Drum page already used that command, explaining why its BPM control worked.

## Changes

- ESP `src/main.cpp`: in 0x25 SET_GLOBAL, forward changed BPM to `TCTL` `[1,1, bpm10_low, bpm10_high]` after the existing `GEN ` packet. Only send TCTL when BPM changed; do not alter drum enable, style, loop sync or audio states.
- Web `js/ui/mobile-shell.js`: BPM commits use existing `sendGlobalUpdate()` only, preventing an unrelated 12-byte `DRUM` packet (with possibly stale drum and looper settings) from being sent during tempo edits. BPM range is 20–250 to match the ESP drum editor.
- Web `js/app.js`: legacy BPM knob release likewise uses only `sendGlobalUpdate()`.
- Web `index.html` and `sw.js`: change import query versions and cache key so installed PWAs refresh the new logic.

## Install order
1. Merge the ESP `src/main.cpp` into the latest 23 October **consolidated ESP project**, build and flash it. The full-source ESP ZIP is based on that latest snapshot, including recent Main, FX, Looper, Tuner and Setup views.
2. Deploy the Web Full Source ZIP (or merge the four changed files).
3. Reload the webapp; if installed as PWA, completely close and relaunch after service-worker activation.
4. Keep the existing Daisy shared-transport firmware; its `TCTL` op 1 support is already present in the most recent transport header.

## Verification
- Compiled and executed a C++ harness of the actual ESP `case 0x25:`: changed BPM sends `GEN ` + `TCTL`; unchanged BPM sends only `GEN `; 137 BPM produces LE 1370; no `DRUM` packet emitted.
- Verified web BPM handler no longer sends the drum+looper composite packet.
- Passed `node --test tests/mobile-neon.test.mjs`, `node --test tests/three-theme.test.mjs`, `node tests/looper-packets.mjs`, `python tests/looper-eq-mobile.py`.
- **Not** yet tested on physical ESP, Daisy or BLE link. Full ESP build requires your board PlatformIO project and TFT setup.

## Important known limitation
`JmTransportLink::ApplyAudio` rejects tempo changes while recorded looper tracks are active because the looper has no realtime time-stretch. If BPM appears frozen with a recorded loop present, that is intentional DSP behavior. Test first with no recorded loops and drums running.
