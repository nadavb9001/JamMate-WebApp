/**
 * JamMate Multi-Effect Controller - Protocol v3
 * Fixed for Drum Pattern Send + Live Drum Updates
 * Includes: EQ serialization (5 bytes), Drum control (0x41)
 */

export const Protocol = {
  // Command IDs
  CMD: {
    SET_PARAM: 0x20,
    SET_TOGGLE: 0x21,
    SET_EQ_BAND: 0x22,
    SET_UTIL: 0x23,
    GET_STATE: 0x30,
    STATE_DATA: 0x31,
    SAVE_PRESET: 0x32,
    LOAD_REQ: 0x33,
    PRESET_DATA: 0x34,
    TUNER_DATA: 0x35,
    SET_GLOBAL: 0x25,
    SET_DRUM_PATTERN: 0x40,
    SET_DRUM_UPDATE: 0x41   // ← NEW LIVE DRUM CONTROL
  },

  // ========================================================
  // Parameter Update (0x20)
  // Sends: [fxId, paramId, value]
  // ========================================================
  createParamUpdate(fxId, paramId, value) {
    const buffer = new ArrayBuffer(6);
    const view = new DataView(buffer);
    view.setUint8(0, this.CMD.SET_PARAM);      // cmd
    view.setUint16(1, 3, true);                // len=3
    view.setUint8(3, fxId);                    // fx id
    view.setUint8(4, paramId);                 // param id
    view.setUint8(5, Math.round(value));       // value
    return buffer;
  },

  // ========================================================
  // Toggle Effect (0x21)
  // Sends: [fxId, enabled]
  // ========================================================
  createToggleUpdate(fxId, isEnabled) {
    const buffer = new ArrayBuffer(5);
    const view = new DataView(buffer);
    view.setUint8(0, this.CMD.SET_TOGGLE);
    view.setUint16(1, 2, true);
    view.setUint8(3, fxId);
    view.setUint8(4, isEnabled ? 1 : 0);
    return buffer;
  },

  // ========================================================
  // Global Update (0x25)
  // Sends: [master, btVol, bpm, flags]
  // ========================================================
  createGlobalUpdate(master, btVol, bpm, a2dpEnabled, bleEnabled, flashReq, resetReq) {
    const buffer = new ArrayBuffer(7);
    const view = new DataView(buffer);
    
    let flags = 0;
    if (a2dpEnabled) flags |= (1 << 0);
    if (bleEnabled) flags |= (1 << 1);
    if (flashReq) flags |= (1 << 2);
    if (resetReq) flags |= (1 << 3);
    
    view.setUint8(0, this.CMD.SET_GLOBAL);
    view.setUint16(1, 4, true);
    view.setUint8(3, Math.round(master));
    view.setUint8(4, Math.round(btVol));
    view.setUint8(5, Math.round(bpm));
    view.setUint8(6, flags);
    return buffer;
  },

  // ========================================================
  // EQ Band Update (0x22)
  // Sends: [bandIdx, enabled, freqL, freqH, gain, q]
  // ========================================================
  createEQUpdate(bandIdx, enabled, freq, gain, q) {
    const buffer = new ArrayBuffer(9);
    const view = new DataView(buffer);
    
    const normGain = Math.max(-20, Math.min(20, Math.round(gain)));
    const normQ = Math.max(0.1, Math.min(16.0, q));
    const scaledQ = Math.round(normQ * 10);
    
    view.setUint8(0, this.CMD.SET_EQ_BAND);
    view.setUint16(1, 6, true);
    view.setUint8(3, bandIdx);
    view.setUint8(4, enabled ? 1 : 0);
    view.setUint16(5, Math.round(freq), true);
    view.setInt8(7, normGain);
    view.setUint8(8, scaledQ);
    return buffer;
  },

  // ========================================================
  // Utility Update (0x23)
  // Sends: [type, enabled, level, freqL, freqH]
  // ========================================================
  createUtilUpdate(type, enabled, level, freq) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint8(0, this.CMD.SET_UTIL);
    view.setUint16(1, 5, true);
    view.setUint8(3, type);
    view.setUint8(4, enabled ? 1 : 0);
    view.setUint8(5, Math.round(level));
    view.setUint16(6, Math.round(freq), true);
    return buffer;
  },

  // ========================================================
  // Get State (0x30)
  // ========================================================
  createGetState() {
    const buffer = new ArrayBuffer(3);
    const view = new DataView(buffer);
    view.setUint8(0, this.CMD.GET_STATE);
    view.setUint16(1, 0, true);
    return buffer;
  },

  // ========================================================
  // Load Preset Request (0x33)
  // Sends: [bank, slot]
  // ========================================================
  createLoadReq(bank, num) {
    const buffer = new ArrayBuffer(5);
    const view = new DataView(buffer);
    view.setUint8(0, this.CMD.LOAD_REQ);
    view.setUint16(1, 2, true);
    view.setUint8(3, bank);
    view.setUint8(4, num);
    return buffer;
  },

  // ========================================================
  // Drum Pattern Grid (0x40)
  // Sends: 144-byte drum pattern (9x16 grid)
  // ========================================================
  createDrumPatternPacket(patternData) {
    const len = 144;
    const buffer = new ArrayBuffer(3 + len);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    
    view.setUint8(0, this.CMD.SET_DRUM_PATTERN);  // cmd 0x40
    view.setUint16(1, len, true);                  // len = 144
    
    let offset = 3;
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 16; col++) {
        bytes[offset++] = patternData[row][col] || 0;
      }
    }
    
    return buffer;
  },

  // ========================================================
  // Drum Live Control (0x41) ← NEW
  // Fixed 17-byte packet:
  // [0x41, 0x11, 0x00, "DRUM"(4), enable(1), level(1), bpm/10(1), 
  //  xx, xx, xx, xx, xx, fill(1), style(1), xx, xx, xx]
  // ========================================================
  createDrumUpdate(enable, level, bpm, style, fill) {
	  const payloadLen = 15;  // "DRUM"(4) + 11 data bytes
	  const buffer = new ArrayBuffer(3 + payloadLen);
	  const view   = new DataView(buffer);
	  const data   = new Uint8Array(buffer);

	  // Command + length (same pattern as other commands)
	  view.setUint8(0, this.CMD.SET_DRUM_UPDATE);   // 0x41
	  view.setUint16(1, payloadLen, true);         // 15, little-endian

	  let o = 3;  // payload starts here

	  // "DRUM"
	  data[o++] = 0x44; // 'D'
	  data[o++] = 0x52; // 'R'
	  data[o++] = 0x55; // 'U'
	  data[o++] = 0x4D; // 'M'

	  // Fields expected by ESP
	  data[o++] = enable ? 1 : 0;                          // payload[4]
	  data[o++] = Math.round(level) & 0xFF;                // payload[5]
	  data[o++] = Math.round(bpm) & 0xFF;             // payload[6]

	  // Reserved bytes 7–12
	  data[o++] = 0;
	  data[o++] = 0;
	  data[o++] = 0;
	  data[o++] = 0;
	  data[o++] = 0;
	  data[o++] = 0;

	  // Fill / Style
	  data[o++] = (fill  || 0) & 0xFF;                     // payload[13]
	  data[o++] = (style || 0) & 0xFF;                     // payload[14]

	  return buffer;
	},

  // ========================================================
  // Save Preset (0x32)
  // Sends: [bank, slot, ...serialized state blob]
  // ========================================================
  createSavePreset(bank, num, appState) {
    const blob = this.serializeState(appState);
    const payloadLen = 2 + blob.byteLength;
    
    const header = new Uint8Array(5);
    header[0] = this.CMD.SAVE_PRESET;  // 0x32
    header[1] = payloadLen & 0xFF;
    header[2] = (payloadLen >> 8) & 0xFF;
    header[3] = bank;
    header[4] = num;
    
    const packet = new Uint8Array(header.length + blob.byteLength);
    packet.set(header);
    packet.set(new Uint8Array(blob), 5);
    return packet;
  },

  // ========================================================
  // Serialize State to Binary Blob (Protocol v3)
  // Format: [ver, bpm, master, nameLen, name, ...effects, EQ block]
  // EQ Block: [0xFE, count, ...points(5 bytes each)]
  // ========================================================
  serializeState(state) {
    const parts = [];
    
    const bpm = state.bpm || 120;
    const master = state.master || 100;
    const name = state.name || "User Preset";
    const nameBytes = new TextEncoder().encode(name.substring(0, 32));
    
    // Header
    parts.push(new Uint8Array([3, bpm, master, nameBytes.length]));
    parts.push(nameBytes);
    
    // Effects (17 effects × [id, enabled, knobCount, knobs(10), dropCount, drops(4)])
    for (let i = 0; i < 17; i++) {
      const fxState = state.effectStates[i] || { enabled: false };
      const fxParams = state.effectParams[i] || {};
      
      const kVals = [];
      for (let k = 0; k < 10; k++) {
        kVals.push(fxParams[`knob${k}`] !== undefined ? fxParams[`knob${k}`] : 50);
      }
      
      const dVals = [];
      for (let d = 0; d < 4; d++) {
        dVals.push(fxParams[`dropdown${d}`] !== undefined ? fxParams[`dropdown${d}`] : 0);
      }
      
      const header = new Uint8Array([i, fxState.enabled ? 1 : 0, kVals.length]);
      parts.push(header);
      parts.push(new Uint8Array(kVals));
      parts.push(new Uint8Array([dVals.length]));
      parts.push(new Uint8Array(dVals));
    }
    
    // EQ Block (if present) - 5 bytes per point now!
    if (state.eqPoints && state.eqPoints.length > 0) {
      parts.push(new Uint8Array([0xFE, state.eqPoints.length]));
      
      const eqBuf = new ArrayBuffer(state.eqPoints.length * 5);
      const eqView = new DataView(eqBuf);
      
      state.eqPoints.forEach((pt, i) => {
        const off = i * 5;
        eqView.setUint16(off, Math.round(pt.freq), true);       // 2 bytes
        eqView.setInt8(off + 2, Math.round(pt.gain));           // 1 byte
        eqView.setUint8(off + 3, Math.round(pt.q * 10));        // 1 byte
        eqView.setUint8(off + 4, pt.enabled ? 1 : 0);           // 1 byte ← ADDED
      });
      
      parts.push(new Uint8Array(eqBuf));
    }
    
    // Combine all parts
    const totalLen = parts.reduce((acc, v) => acc + v.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    parts.forEach(p => {
      result.set(p, offset);
      offset += p.length;
    });
    
    return result.buffer;
  },

  // ========================================================
  // Deserialize Binary Blob → State Object
  // ========================================================
  deserializeState(buffer) {
    const view = new DataView(buffer);
    let offset = 0;
    
    const state = {
      effectStates: {},
      effectParams: {},
      eqPoints: [],
      bpm: 120,
      master: 100,
      name: "Loaded"
    };
    
    if (buffer.byteLength < 4) return state;
    
    // Header
    const version = view.getUint8(offset++);
    state.bpm = view.getUint8(offset++);
    state.master = view.getUint8(offset++);
    
    const nameLen = view.getUint8(offset++);
    if (nameLen > 0 && offset + nameLen <= buffer.byteLength) {
      const nameBytes = new Uint8Array(buffer, offset, nameLen);
      state.name = new TextDecoder().decode(nameBytes);
      offset += nameLen;
    }
    
    // Parse blocks
    while (offset < buffer.byteLength) {
      const id = view.getUint8(offset++);
      
      // EQ Tag
      if (id === 0xFE) {
        if (offset >= buffer.byteLength) break;
        const count = view.getUint8(offset++);
        
        for (let i = 0; i < count && i < 12; i++) {
          if (offset + 5 > buffer.byteLength) break;  // Need 5 bytes
          
          const freq = view.getUint16(offset, true);
          const gain = view.getInt8(offset + 2);
          const q = view.getUint8(offset + 3) / 10;
          const enabled = view.getUint8(offset + 4) !== 0;
          
          state.eqPoints.push({ freq, gain, q, enabled });
          offset += 5;
        }
        continue;
      }
      
      // Standard effect
      if (offset + 2 > buffer.byteLength) break;
      const enabled = view.getUint8(offset++);
      const kCount = view.getUint8(offset++);
      
      state.effectStates[id] = { enabled: !!enabled, selected: false };
      state.effectParams[id] = {};
      
      // Knobs
      for (let k = 0; k < kCount; k++) {
        if (offset >= buffer.byteLength) break;
        state.effectParams[id][`knob${k}`] = view.getUint8(offset++);
      }
      
      // Dropdowns
      if (offset >= buffer.byteLength) break;
      const dCount = view.getUint8(offset++);
      for (let d = 0; d < dCount; d++) {
        if (offset >= buffer.byteLength) break;
        state.effectParams[id][`dropdown${d}`] = view.getUint8(offset++);
      }
    }
    
    return state;
  }
};