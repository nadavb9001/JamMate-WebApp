# JamMate — Global Master Volume Fix (2026-10-25)

## Expected behavior

- Every ESP boot selects **Clean 1 at Master Volume 20%**. The stored `/state.dat` volume is intentionally ignored on startup.
- Adjust the master volume from the ESP encoder or updated three-theme webapp; the chosen level stays unchanged across **bank/preset selection, saved preset loading, preset saving, effect enable/disable/parameter changes, BPM changes, Bluetooth setting changes, and `load-` serial preset imports**.
- Old factory/custom presets and serial dumps continue to contain a master-volume byte for backwards-compatible binary/text formats. The ESP ignores that *stored* number when selecting a preset, replacing it with its current global master level before sending anything to the DSP. No factory-preset flash wipe is required.
- Resetting/rebooting the ESP restores **20%**, even if it was previously adjusted to e.g. 65%.
- The ESP sends its current level to the Daisy when the UART link connects, before the DSP preset transfer. It also resends the live level on completion of a reliable JMP2 preset transfer to prevent a mid-transfer volume change being undone by the preset commit.

## Important compatibility note

**Deploy both the ESP patch and updated webapp.** Explicit web volume adjustments now use BLE command `0x26` (payload: one byte, 0–100 percent). The existing `0x25` global packet remains for BPM and Bluetooth settings; its legacy master-volume field is intentionally *ignored by the new ESP*, preventing unrelated webapp changes from resetting master volume. Older cached webapps that only send volume through `0x25` will no longer change master volume; force a PWA/app reload after deployment. The ESP's physical master volume control still works without the webapp.

Daisy firmware **does not need modification**: all supported DSP preset and legacy GEN messages already carry volume, and the ESP now always inserts the active global value. The DSP reaches the 20% start level once its serial link to ESP is established; the very earliest standalone Daisy power-on output before this connection depends on the installed DSP firmware's own initial `MasterVol` value.

## Files

- `ESP_Latest_Global_Master_Full.zip` — consolidated ESP source based on the latest *Smooth Looper / Clean 1 / serial dump/load / BPM sync* release.
- `Web_Three_Themes_Global_Master_Full.zip` — consolidated three-theme webapp with EQ, Looper and BPM fixes retained.
- `Global_Master_Changed_Files.zip` — only changed ESP/webapp source plus tests and this README.

The original ESP package did not include board-specific `platformio.ini`, TFT_eSPI User_Setup, or the full hardware build environment. Use your existing build settings. Firmware flashing and audio output must be validated on the actual ESP/Daisy setup.

## Regression tests run

- Web `tests/master-volume-global.test.mjs`: explicit BLE `0x26`, 20% startup synchronization, no reset on legacy 100% preset, current volume serialization, BPM-only `0x25`.
- ESP `tests/test_master_volume_source_guards.py`: boot state; physical, BLE, saved and serial preset paths; reliable DSP preset commit.
- Existing mobile, theme, Looper, NAM and ESP source guard tests.
- Existing ESP host Looper rendering and serial-preset-format tests.

## Recommended hardware test

1. Power on ESP and Daisy: select Clean 1, verify the screen and sound start at 20% once connected.
2. Raise volume to 38% on the ESP. Change banks/presets by encoder, web and MIDI; toggle several effects and adjust BPM. Verify it stays 38%.
3. Change master to 62% on the webapp. Verify the ESP display, audio gain and webapp agree; change presets again.
4. Dump a preset (`dump-`), adjust volume to 27%, and restore the dump (`load-`). Audio should **remain at 27%** even if the dump says `VOLUME=62`.
5. Reboot: Master Volume should return to 20%.
6. Change volume rapidly while a large preset is loading; verify it settles on the last deliberately selected master volume.
