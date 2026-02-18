// ================================================================
// Protocol.js  —  BLE Packet Builders
//
// FLAT PARAM CONVENTION (matches config.js):
//   For any effect, the flat param array is:
//     [enable(1), knob0, knob1, ..., knobK, drop0, drop1, ..., dropD]
//   Total bytes = 1 + K + D  (getFlatParamCount from config.js)
//
// CMD 0x20  SET_PARAM:   [fxId, flatParamIndex, value]
//   flatParamIndex 0     = checkbox (enable)  value: 0/1
//   flatParamIndex 1..K  = knob k             value: 0..255
//   flatParamIndex K+1.. = dropdown d         value: 0..255
//
// CMD 0x50  UPDATE_CONFIG: raw minimal-JSON bytes of APP_CONFIG layout
// ================================================================

import { APP_CONFIG, buildFlatParams } from '../config.js';

export const Protocol = {
  CMD: {
    SET_PARAM:           0x20,
    SET_TOGGLE:          0x21,   // legacy; prefer SET_PARAM idx=0
    SET_EQ_BAND:         0x22,
    SET_UTIL:            0x23,
    SET_GLOBAL:          0x25,
    GET_STATE:           0x30,
    STATE_DATA:          0x31,
    SAVE_PRESET:         0x32,
    LOAD_REQ:            0x33,
    PRESET_DATA:         0x34,
    TUNER_DATA:          0x35,
    SET_DRUM_PATTERN:    0x40,
    SET_DRUM_UPDATE:     0x41,
    NAM_LIST_DATA:       0x45,
    IR_LIST_DATA:        0x46,
    UPDATE_CONFIG:       0x50,   // NEW: upload config layout to ESP LittleFS
    FLASH_DSP:           0x60,
    RESET_DSP:           0x61,
    CMD_START_MIDI_SCAN: 0x62,
    READ_SD_CARD:        0x63,
    SAVE_TO_SD:          0x64,
  },

  // ----------------------------------------------------------------
  // Simple 1-byte system packet (no payload)
  // ----------------------------------------------------------------
  createSystemPacket(cmdId) {
    const buffer = new ArrayBuffer(1);
    new DataView(buffer).setUint8(0, cmdId);
    return buffer;
  },

  createSDCardReadCommand() {
    return this.createSystemPacket(this.CMD.READ_SD_CARD);
  },

  // ----------------------------------------------------------------
  // SET_PARAM  —  single flat-index parameter update
  //
  //   Wire format: [CMD(1)][payloadLen16LE(2)][fxId(1)][flatIdx(1)][value(1)]
  //
  //   flatIdx 0     = checkbox (enable/disable)  value 0 or 1
  //   flatIdx 1..K  = knob[flatIdx-1]            value 0..255
  //   flatIdx K+1.. = dropdown[flatIdx-1-K]      value 0..255
  // ----------------------------------------------------------------
  createParamUpdate(fxId, flatIdx, value) {
    const buf  = new ArrayBuffer(6);
    const view = new DataView(buf);
    view.setUint8(0,  this.CMD.SET_PARAM);
    view.setUint16(1, 3, true);
    view.setUint8(3,  fxId);
    view.setUint8(4,  flatIdx);
    view.setUint8(5,  Math.round(value));
    return buf;
  },

  // ----------------------------------------------------------------
  // TOGGLE  —  convenience wrapper: flat index 0 = checkbox
  // ----------------------------------------------------------------
  createToggleUpdate(fxId, isEnabled) {
    return this.createParamUpdate(fxId, 0, isEnabled ? 1 : 0);
  },

  // ----------------------------------------------------------------
  // SERIALIZE STATE  →  binary blob
  //
  // Layout:
  //   [ver=0x03][bpm][master][nameLen][name bytes]
  //   For each effect i = 0..tabCount-1:
  //     [fxId(1)][flatCount(1)][p0..p_{flatCount-1}]
  //       p[0]        = enable (0/1)
  //       p[1..K]     = knob values
  //       p[K+1..K+D] = dropdown values
  //   [0xFE][eqCount(1)][eq points, 5 bytes each]
  //
  // The ESP reads fxId, then flatCount, then exactly that many bytes.
  // No separate knob/dropdown split needed anywhere in the chain.
  // ----------------------------------------------------------------
  serializeState(state) {
    const parts = [];
    const name      = (state.name || "User Preset").substring(0, 32);
    const nameBytes = new TextEncoder().encode(name);

    parts.push(new Uint8Array([0x03, state.bpm || 120, 100, nameBytes.length]));
    parts.push(nameBytes);

    for (let i = 0; i < APP_CONFIG.tabs.length; i++) {
      const tab        = APP_CONFIG.tabs[i];
      const fxState    = state.effectStates[i] || { enabled: false };
      const fxParams   = state.effectParams[i]  || {};
      const flatParams = buildFlatParams(tab, fxState, fxParams);
      parts.push(new Uint8Array([i, flatParams.length]));
      parts.push(flatParams);
    }

    if (state.eqPoints && state.eqPoints.length > 0) {
      parts.push(new Uint8Array([0xFE, state.eqPoints.length]));
      const eqBuf  = new ArrayBuffer(state.eqPoints.length * 5);
      const eqView = new DataView(eqBuf);
      state.eqPoints.forEach((pt, i) => {
        const o = i * 5;
        eqView.setUint16(o,     Math.round(pt.freq), true);
        eqView.setInt8(o + 2,   Math.round(pt.gain));
        eqView.setUint8(o + 3,  Math.round(pt.q * 10));
        eqView.setUint8(o + 4,  pt.enabled ? 1 : 0);
      });
      parts.push(new Uint8Array(eqBuf));
    }

    const total  = parts.reduce((a, v) => a + v.length, 0);
    const result = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { result.set(p, off); off += p.length; }
    return result.buffer;
  },

  // ----------------------------------------------------------------
  // DESERIALIZE STATE  ←  binary blob
  // Splits flat params back into effectStates / effectParams using
  // APP_CONFIG tab definitions loaded at runtime.
  // ----------------------------------------------------------------
  deserializeState(buffer) {
    const view = new DataView(buffer);
    let off    = 0;
    const len  = buffer.byteLength;

    const state = {
      effectStates: {}, effectParams: {},
      eqPoints: [], bpm: 120, master: 100, name: "Loaded"
    };

    if (len < 4) return state;

    /* version */ view.getUint8(off++);
    state.bpm = view.getUint8(off++);
    /* master */ view.getUint8(off++);

    const nameLen = view.getUint8(off++);
    if (nameLen > 0 && off + nameLen <= len) {
      state.name = new TextDecoder().decode(new Uint8Array(buffer, off, nameLen));
      off += nameLen;
    }

    while (off < len) {
      const id = view.getUint8(off++);

      // EQ block sentinel
      if (id === 0xFE) {
        if (off >= len) break;
        const count = view.getUint8(off++);
        for (let i = 0; i < count && i < 12; i++) {
          if (off + 5 > len) break;
          state.eqPoints.push({
            freq:    view.getUint16(off,     true),
            gain:    view.getInt8(off + 2),
            q:       view.getUint8(off + 3) / 10,
            enabled: view.getUint8(off + 4) !== 0
          });
          off += 5;
        }
        continue;
      }

      if (off >= len) break;
      const flatCount = view.getUint8(off++);
      if (off + flatCount > len) break;

      state.effectStates[id] = { enabled: false, selected: false };
      state.effectParams[id] = {};

      const tab = APP_CONFIG.tabs[id];
      if (tab && flatCount >= 1) {
        state.effectStates[id].enabled = view.getUint8(off) !== 0;
        const K = tab.params.knobs.length;
        const D = tab.params.dropdowns.length;
        for (let k = 0; k < K && (1 + k) < flatCount; k++) {
          state.effectParams[id][`knob${k}`] = view.getUint8(off + 1 + k);
        }
        for (let d = 0; d < D && (1 + K + d) < flatCount; d++) {
          state.effectParams[id][`dropdown${d}`] = view.getUint8(off + 1 + K + d);
        }
      }
      off += flatCount;
    }

    return state;
  },

  // ----------------------------------------------------------------
  // UPDATE_CONFIG  —  send APP_CONFIG layout to ESP LittleFS
  //
  // Builds a minimal JSON the ESP parses with ArduinoJson.
  // Packet: [CMD=0x50][lenL][lenH][json bytes...]
  //
  // JSON schema:
  //   { "tabs": [ { "short_name":"GATE", "dsp_tag":"GATE", "k":5, "d":0 }, ... ] }
  // ----------------------------------------------------------------
  createConfigPacket() {
    const minimal = {
      tabs: APP_CONFIG.tabs.map(tab => ({
        short_name: tab.short_name,
        dsp_tag:    tab.dsp_tag,
        k:          tab.params.knobs.length,
        d:          tab.params.dropdowns.length
      }))
    };

    const json      = JSON.stringify(minimal);
    const jsonBytes = new TextEncoder().encode(json);
    const buf       = new Uint8Array(3 + jsonBytes.length);
    buf[0] = this.CMD.UPDATE_CONFIG;
    buf[1] = jsonBytes.length & 0xFF;
    buf[2] = (jsonBytes.length >> 8) & 0xFF;
    buf.set(jsonBytes, 3);

    console.log(`[Protocol] createConfigPacket: ${jsonBytes.length} bytes`, JSON.parse(json));
    return buf.buffer;
  },

  // ----------------------------------------------------------------
  // SAVE PRESET
  // ----------------------------------------------------------------
  createSavePreset(bank, num, appState) {
    const blob       = this.serializeState(appState);
    const payloadLen = 2 + blob.byteLength;
    const header     = new Uint8Array(5);
    header[0] = this.CMD.SAVE_PRESET;
    header[1] = payloadLen & 0xFF;
    header[2] = (payloadLen >> 8) & 0xFF;
    header[3] = bank;
    header[4] = num;
    const packet = new Uint8Array(header.length + blob.byteLength);
    packet.set(header);
    packet.set(new Uint8Array(blob), 5);
    return packet;
  },

  // ----------------------------------------------------------------
  // LOAD REQUEST
  // ----------------------------------------------------------------
  createLoadReq(bank, num) {
    const buf  = new ArrayBuffer(5);
    const view = new DataView(buf);
    view.setUint8(0,  this.CMD.LOAD_REQ);
    view.setUint16(1, 2, true);
    view.setUint8(3,  bank);
    view.setUint8(4,  num);
    return buf;
  },

  // ----------------------------------------------------------------
  // GET STATE  (handshake)
  // ----------------------------------------------------------------
  createGetState() {
    const buf  = new ArrayBuffer(3);
    const view = new DataView(buf);
    view.setUint8(0,  this.CMD.GET_STATE);
    view.setUint16(1, 0, true);
    return buf;
  },

  // ----------------------------------------------------------------
  // GLOBAL UPDATE
  // ----------------------------------------------------------------
  createGlobalUpdate(master, btVol, bpm, a2dpEnabled, bleEnabled, flashReq, resetReq) {
    const buf  = new ArrayBuffer(7);
    const view = new DataView(buf);
    let flags = 0;
    if (a2dpEnabled) flags |= 1;
    if (bleEnabled)  flags |= 2;
    if (flashReq)    flags |= 4;
    if (resetReq)    flags |= 8;
    view.setUint8(0,  this.CMD.SET_GLOBAL);
    view.setUint16(1, 4, true);
    view.setUint8(3,  Math.round(master));
    view.setUint8(4,  Math.round(btVol));
    view.setUint8(5,  Math.round(bpm));
    view.setUint8(6,  flags);
    return buf;
  },

  // ----------------------------------------------------------------
  // EQ BAND UPDATE
  // ----------------------------------------------------------------
  createEQUpdate(bandIdx, enabled, freq, gain, q) {
    const buf  = new ArrayBuffer(9);
    const view = new DataView(buf);
    view.setUint8(0,  this.CMD.SET_EQ_BAND);
    view.setUint16(1, 6, true);
    view.setUint8(3,  bandIdx);
    view.setUint8(4,  enabled ? 1 : 0);
    view.setUint16(5, Math.round(freq), true);
    view.setInt8(7,   Math.max(-20, Math.min(20, Math.round(gain))));
    view.setUint8(8,  Math.round(Math.max(0.1, Math.min(16.0, q)) * 10));
    return buf;
  },

  // ----------------------------------------------------------------
  // UTIL UPDATE
  // ----------------------------------------------------------------
  createUtilUpdate(type, enabled, level, freq) {
    const buf  = new ArrayBuffer(8);
    const view = new DataView(buf);
    view.setUint8(0,  this.CMD.SET_UTIL);
    view.setUint16(1, 5, true);
    view.setUint8(3,  type);
    view.setUint8(4,  enabled ? 1 : 0);
    view.setUint8(5,  Math.round(level));
    view.setUint16(6, Math.round(freq), true);
    return buf;
  },

  // ----------------------------------------------------------------
  // DRUM + LOOPER UPDATE  (CMD 0x41)
  //
  // Wire format: [CMD][lenL][lenH] "DRUM" [payload]
  //
  // Payload (fixed 16 bytes after the 4-byte tag):
  //   [0]  drumEnable    0/1
  //   [1]  drumLevel     0-255
  //   [2]  bpm           0-255
  //   [3]  drumStyle     0-10
  //   [4]  drumFill      0-4
  //   [5]  drumNumber    1-5
  //   [6]  looperEnable  0/1
  //   [7]  looperLevel   0-255
  //   [8]  loopSync      0=None,1=Bar,2=Beat
  //   [9]  loopArm       0=None,1=Low,2=High
  //   [10] loopLength    0=Custom,4/8/12/16
  //   [11] loopTracks    1-4
  //   [12..15] reserved  0
  // Total payload after tag = 16 bytes; total packet = 3+4+16 = 23
  // ----------------------------------------------------------------
  createDrumUpdate(drumEnable, drumLevel, bpm, style, fill, drumNumber,
                   looperEnable, looperLevel, loopSync, loopArm, loopLength, loopTracks) {
    const TAG        = [0x44, 0x52, 0x55, 0x4D]; // "DRUM"
    const payloadLen = TAG.length + 16;            // 20 bytes
    const buf        = new ArrayBuffer(3 + payloadLen);
    const view       = new DataView(buf);
    const data       = new Uint8Array(buf);

    view.setUint8(0,  this.CMD.SET_DRUM_UPDATE);
    view.setUint16(1, payloadLen, true);

    let o = 3;
    TAG.forEach(b => { data[o++] = b; });

    data[o++] = drumEnable   ? 1 : 0;
    data[o++] = Math.round(drumLevel)    & 0xFF;
    data[o++] = Math.round(bpm)          & 0xFF;
    data[o++] = (style      || 0)        & 0xFF;
    data[o++] = (fill       || 0)        & 0xFF;
    data[o++] = (drumNumber || 1)        & 0xFF;
    data[o++] = looperEnable ? 1 : 0;
    data[o++] = Math.round(looperLevel)  & 0xFF;
    data[o++] = (loopSync   || 0)        & 0xFF;
    data[o++] = (loopArm    || 0)        & 0xFF;
    data[o++] = (loopLength || 0)        & 0xFF;
    data[o++] = (loopTracks || 1)        & 0xFF;
    data[o++] = 0; data[o++] = 0; data[o++] = 0; data[o++] = 0; // reserved

    return buf;
  },

  // ----------------------------------------------------------------
  // SAVE TO SD  (CMD 0x64)
  // Simple 1-byte command; ESP flushes current state to SD card.
  // ----------------------------------------------------------------
  createSaveToSD() {
    if (!this.CMD.SAVE_TO_SD) this.CMD.SAVE_TO_SD = 0x64;
    return this.createSystemPacket(this.CMD.SAVE_TO_SD);
  },

  // ----------------------------------------------------------------
  // DRUM PATTERN
  // ----------------------------------------------------------------
  createDrumPatternPacket(patternData) {
    const len  = 144;
    const buf  = new ArrayBuffer(3 + len);
    const view = new DataView(buf);
    const bytes = new Uint8Array(buf);
    view.setUint8(0,  this.CMD.SET_DRUM_PATTERN);
    view.setUint16(1, len, true);
    let off = 3;
    for (let row = 0; row < 9; row++)
      for (let col = 0; col < 16; col++)
        bytes[off++] = patternData[row][col] || 0;
    return buf;
  },
  // ----------------------------------------------------------------
	// toFlatIdx — convert (fxIdx, type, subIdx) → flat param index
	// type: 'checkbox' | 'knob' | 'dropdown'
	// flatIdx 0       = checkbox (enable)
	// flatIdx 1..K    = knobs
	// flatIdx K+1..   = dropdowns
	// ----------------------------------------------------------------
	toFlatIdx(fxIdx, type, subIdx) {
		const tab = APP_CONFIG.tabs[fxIdx];
		if (!tab) return 0;
		const K = tab.params.knobs.length;
		if (type === 'checkbox')  return 0;
		if (type === 'knob')      return 1 + subIdx;
		if (type === 'dropdown')  return 1 + K + subIdx;
		return 0;
	},
};
