// ================================================================
// true_bypass.cpp  —  CHANGES & NOTES
//
// The good news: the DSP side requires MINIMAL changes.
//
// FLAT PARAM FORMAT ON THE WIRE (ESP → DSP UART packet):
//   Header: 4-char tag (e.g. "OVRD", "GATE", "RVRB")
//   data[0..3]  = header (4 bytes, as before)
//   data[4]     = enable  (was always data[4], unchanged)
//   data[5]     = knob0   (was always data[5], unchanged)
//   data[6]     = knob1   (unchanged)
//   ...
//   data[4+K]   = dropdown0
//   data[4+K+1] = dropdown1
//   ...
//
// This is IDENTICAL to the old format. The only difference is:
//   OLD: knobs always filled 10 slots, drops always filled 5 slots
//        (with zeroes padded if fewer params)
//   NEW: only the actual K knobs + D drops are sent (no padding)
//
// For effects where K + D < 15, the packet is simply SHORTER.
// All existing update_param() handlers that read by absolute index
// (data[4], data[5], etc.) continue to work correctly because the
// actual parameters are still at the same positions.
// ================================================================


// ================================================================
// EXISTING HANDLERS — NO CHANGES REQUIRED
// ================================================================
//
// The following handlers all read params positionally from data[]:
//   jm_noisegate.update_param(data)   — reads data[4..8]
//   jm_compressor.update_param(data)  — reads data[4..11]
//   jm_overdrive.update_param(data)   — reads data[4..15]
//   jm_distortion.update_param(data)  — reads data[4..15]
//   jm_equalizer.update_param(data)   — reads data[4..15]
//   jm_harmonizer.update_param(data)  — reads data[4..13]
//   jm_chorus.update_param(data)      — reads data[4..10]
//   jm_pitchshifter.update_param(data)— reads data[4..10]
//   jm_flanger.update_param(data)     — reads data[4..8]
//   jm_phaser.update_param(data)      — reads data[4..11]
//   jm_tremolo.update_param(data)     — reads data[4..9]
//   jm_fir.update_param(data)         — reads data[4..14]
//   jm_delay.update_param(data)       — reads data[4..15]
//   jm_freeverb.update_param(data)    — reads data[4..15]
//
// Because knobs still come first (data[4..4+K-1]) and dropdowns
// still come after (data[4+K..4+K+D-1]), positional indexing is
// unchanged.


// ================================================================
// VIBRATO — special case (currently not handled explicitly)
// ================================================================
//
// Vibrato ("VIBR") falls through to the else branch in UpdateParam.
// Add this handler in UpdateParam if Vibrato is implemented:
//
// else if (strcmp(Header, "VIBR") == 0)
// {
//     jm_vibrato.update_param(data);
//     return;
// }


// ================================================================
// GENERIC EFFECT ("GNRC") — NEW handler needed
// ================================================================
//
// The "Generic" effect (idx 17) sends tag "GNRC".
// Add this to UpdateParam if you use the Generic effect:
//
// else if (strcmp(Header, "GNRC") == 0)
// {
//     // Flat params: data[4]=enable, data[5..14]=knobs[0..9],
//     //              data[15..16]=dropdowns[0..1]
//     // Route to whatever generic/debug handler you want.
//     // For now, just log it:
//     hw.PrintLine("GNRC: en=%d k0=%d k1=%d d0=%d",
//         data[4], data[5], data[6], data[15]);
//     return;
// }


// ================================================================
// NAM — no data[] index change
// ================================================================
//
// The NAM handler reads:
//   data[4] = enable
//   data[5] = level    (knob0)
//   data[6] = pre_att  (knob1)
//   data[7] = NAM_Model (dropdown0 = knob2 + 1 in new flat = index 3)
//
// Wait — in the NEW flat format:
//   data[4] = enable  (flatIdx 0)
//   data[5] = level   (flatIdx 1 = knob0)
//   data[6] = pre_att (flatIdx 2 = knob1)
//   data[7] = NAM_Model dropdown0 (flatIdx 3 = K+1 where K=2)
//
// The existing handler reads data[7] for the model index:
//   if (data[7] < num_nam_files_found) { NAM_FileIndex = data[7]; }
//
// This is CORRECT for the new flat format. No change needed.


// ================================================================
// AWAH — check needed
// ================================================================
//
// The old AWAH handler only reads data[4] and data[5]:
//   jm_autowah.enable = data[4];   // enable — correct (flatIdx 0)
//   jm_autowah.setPreset(data[5]); // was knob0 "dry"
//
// This still works for the enable flag. The autowah's internal
// update_param (if it reads more bytes) reads knobs from data[5..13]
// and dropdowns from data[14..16], which matches the new flat layout.


// ================================================================
// SUMMARY OF REQUIRED DSP CHANGES
// ================================================================
//
// 1. ADD "VIBR" handler if Vibrato is implemented.
// 2. ADD "GNRC" handler for Generic effect.
// 3. No other changes required.
//
// All existing update_param() implementations are forward-compatible
// with the new flat format because:
//   a) The enable byte is still at data[4]
//   b) Knobs are still at data[5..4+K]
//   c) Dropdowns are still at data[5+K..4+K+D]
//   d) No gaps or padding between knobs and dropdowns
// ================================================================
