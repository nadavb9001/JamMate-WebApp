// Protocol.js - UPDATED with row-by-row drum pattern sending

import { APP_CONFIG } from '../config.js';

export const Protocol = {
  CMD: {
    SETPARAM: 0x20,
    SETTOGGLE: 0x21,
    SETEQBAND: 0x22,
    SETUTIL: 0x23,
    GETSTATE: 0x30,
    STATEDATA: 0x31,
    SAVEPRESET: 0x32,
    LOADREQ: 0x33,
    PRESETDATA: 0x34,
    TUNERDATA: 0x35,
    SETGLOBAL: 0x25,
    SETDRUMPATTERN: 0x40,
    SETDRUMUPDATE: 0x41,
    NAMLISTDATA: 0x45,
    IRLISTDATA: 0x46,
    FLASHDSP: 0x60,
    RESETDSP: 0x61,
    CMDSTARTMIDISCAN: 0x62,
    READSDCARD: 0x63
  },

  // FIXED: Send drum pattern row-by-row to match ESP32 expectation
  createDrumPatternPacket(patternData, startRowIndex = null) {
	  const packets = [];
	  const rowOffset = startRowIndex !== null ? startRowIndex : 0;
	  
	  for (let i = 0; i < patternData.length && i < 9; i++) {
		const actualRowIndex = rowOffset + i; // ✅ Calculate real row index
		
		if (actualRowIndex >= 9) break;
		
		const buffer = new ArrayBuffer(3 + 17);
		const view = new DataView(buffer);
		const bytes = new Uint8Array(buffer);
		
		view.setUint8(0, this.CMD.SETDRUMPATTERN);
		view.setUint16(1, 17, true);
		
		bytes[3] = actualRowIndex; // ✅ Use actual row (0-8)
		
		for (let col = 0; col < 16; col++) {
		  bytes[4 + col] = patternData[i][col] || 0;
		}
		
		packets.push(buffer);
	  }
	  
	  return packets;
	},


  // Rest of Protocol methods remain the same...
  createSystemPacket(cmdId) {
    const buffer = new ArrayBuffer(1);
    const view = new DataView(buffer);
    view.setUint8(0, cmdId);
    return buffer;
  },

  createSDCardReadCommand() {
    console.log('Protocol: Creating SD Card Read command');
    return this.createSystemPacket(this.CMD.READSDCARD);
  },

  createParamUpdate(fxId, paramId, value) {
    const buffer = new ArrayBuffer(6);
    const view = new DataView(buffer);
    view.setUint8(0, this.CMD.SETPARAM);
    view.setUint16(1, 3, true);
    view.setUint8(3, fxId);
    view.setUint8(4, paramId);
    view.setUint8(5, Math.round(value));
    return buffer;
  },

  createToggleUpdate(fxId, isEnabled) {
    const buffer = new ArrayBuffer(5);
    const view = new DataView(buffer);
    view.setUint8(0, this.CMD.SETTOGGLE);
    view.setUint16(1, 2, true);
    view.setUint8(3, fxId);
    view.setUint8(4, isEnabled ? 1 : 0);
    return buffer;
  },

  createGlobalUpdate(master, btVol, bpm, a2dpEnabled, bleEnabled, flashReq, resetReq) {
    const buffer = new ArrayBuffer(7);
    const view = new DataView(buffer);
    let flags = 0;
    if (a2dpEnabled) flags |= (1 << 0);
    if (bleEnabled) flags |= (1 << 1);
    if (flashReq) flags |= (1 << 2);
    if (resetReq) flags |= (1 << 3);
    view.setUint8(0, this.CMD.SETGLOBAL);
    view.setUint16(1, 4, true);
    view.setUint8(3, Math.round(master));
    view.setUint8(4, Math.round(btVol));
    view.setUint8(5, Math.round(bpm));
    view.setUint8(6, flags);
    return buffer;
  },

  createEQUpdate(bandIdx, enabled, freq, gain, q) {
    const buffer = new ArrayBuffer(9);
    const view = new DataView(buffer);
    const normGain = Math.max(-20, Math.min(20, Math.round(gain)));
    const normQ = Math.max(0.1, Math.min(16.0, q));
    const scaledQ = Math.round(normQ * 10);
    view.setUint8(0, this.CMD.SETEQBAND);
    view.setUint16(1, 6, true);
    view.setUint8(3, bandIdx);
    view.setUint8(4, enabled ? 1 : 0);
    view.setUint16(5, Math.round(freq), true);
    view.setInt8(7, normGain);
    view.setUint8(8, scaledQ);
    return buffer;
  },

  createUtilUpdate(type, enabled, level, freq) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint8(0, this.CMD.SETUTIL);
    view.setUint16(1, 5, true);
    view.setUint8(3, type);
    view.setUint8(4, enabled ? 1 : 0);
    view.setUint8(5, Math.round(level));
    view.setUint16(6, Math.round(freq), true);
    return buffer;
  },

  createDrumUpdate(drumEnable, drumLevel, bpm, style, fill, looperEnable, looperLevel, loopNumber, sync) {
    const payloadLen = 15;
    const buffer = new ArrayBuffer(3 + payloadLen);
    const view = new DataView(buffer);
    const data = new Uint8Array(buffer);
    view.setUint8(0, this.CMD.SETDRUMUPDATE);
    view.setUint16(1, payloadLen, true);
    let o = 3;
    data[o++] = 0x44;
    data[o++] = 0x52;
    data[o++] = 0x55;
    data[o++] = 0x4D;
    data[o++] = drumEnable ? 1 : 0;
    data[o++] = Math.round(drumLevel) & 0xFF;
    data[o++] = Math.round(bpm) & 0xFF;
    data[o++] = looperEnable ? 1 : 0;
    data[o++] = Math.round(looperLevel) & 0xFF;
    data[o++] = 0;
    data[o++] = 0;
    data[o++] = 0;
    data[o++] = 0;
    data[o++] = (fill || 0) & 0xFF;
    data[o++] = (style || 0) & 0xFF;
    data[o++] = (loopNumber || 0) & 0xFF;
    data[o++] = (sync || 0) & 0xFF;
    return buffer;
  },

  createGetState() {
    const buffer = new ArrayBuffer(3);
    const view = new DataView(buffer);
    view.setUint8(0, this.CMD.GETSTATE);
    view.setUint16(1, 0, true);
    return buffer;
  },

  createLoadReq(bank, num) {
    const buffer = new ArrayBuffer(5);
    const view = new DataView(buffer);
    view.setUint8(0, this.CMD.LOADREQ);
    view.setUint16(1, 2, true);
    view.setUint8(3, bank);
    view.setUint8(4, num);
    return buffer;
  },

  createSavePreset(bank, num, appState) {
    const blob = this.serializeState(appState);
    const payloadLen = 2 + blob.byteLength;
    const header = new Uint8Array(5);
    header[0] = this.CMD.SAVEPRESET;
    header[1] = payloadLen & 0xFF;
    header[2] = (payloadLen >> 8) & 0xFF;
    header[3] = bank;
    header[4] = num;
    const packet = new Uint8Array(header.length + blob.byteLength);
    packet.set(header);
    packet.set(new Uint8Array(blob), 5);
    return packet;
  },

  serializeState(state) {
    const parts = [];
    const bpm = state.bpm || 120;
    const master = 100;
    const name = state.name || 'User Preset';
    const nameBytes = new TextEncoder().encode(name.substring(0, 32));
    parts.push(new Uint8Array([3, bpm, master, nameBytes.length]));
    parts.push(nameBytes);
    for (let i = 0; i < 18; i++) {
      const fxState = state.effectStates[i] || { enabled: false };
      const fxParams = state.effectParams[i] || {};
      const config = APPCONFIG.tabs[i];
      const kCount = config ? config.params.knobs.length : 10;
      const dCount = config ? config.params.dropdowns.length : 4;
      const kVals = [];
      for (let k = 0; k < kCount; k++) {
        kVals.push(fxParams[`knob${k}`] !== undefined ? fxParams[`knob${k}`] : 50);
      }
      const dVals = [];
      for (let d = 0; d < dCount; d++) {
        dVals.push(fxParams[`dropdown${d}`] !== undefined ? fxParams[`dropdown${d}`] : 0);
      }
      const header = new Uint8Array([i, fxState.enabled ? 1 : 0, kVals.length]);
      parts.push(header);
      parts.push(new Uint8Array(kVals));
      parts.push(new Uint8Array([dVals.length]));
      parts.push(new Uint8Array(dVals));
    }
    if (state.eqPoints && state.eqPoints.length > 0) {
      parts.push(new Uint8Array([0xFE, state.eqPoints.length]));
      const eqBuf = new ArrayBuffer(state.eqPoints.length * 5);
      const eqView = new DataView(eqBuf);
      state.eqPoints.forEach((pt, i) => {
        const off = i * 5;
        eqView.setUint16(off, Math.round(pt.freq), true);
        eqView.setInt8(off + 2, Math.round(pt.gain));
        eqView.setUint8(off + 3, Math.round(pt.q * 10));
        eqView.setUint8(off + 4, pt.enabled ? 1 : 0);
      });
      parts.push(new Uint8Array(eqBuf));
    }
    const totalLen = parts.reduce((acc, v) => acc + v.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    parts.forEach(p => {
      result.set(p, offset);
      offset += p.length;
    });
    return result.buffer;
  },

  deserializeState(buffer) {
    const view = new DataView(buffer);
    let offset = 0;
    const len = buffer.byteLength;
    const state = {
      effectStates: [],
      effectParams: [],
      eqPoints: [],
      bpm: 120,
      master: 100,
      name: 'Loaded'
    };
    if (len < 4) return state;
    const version = view.getUint8(offset++);
    state.bpm = view.getUint8(offset++);
    const loadedMaster = view.getUint8(offset++);
    if (offset >= len) return state;
    const nameLen = view.getUint8(offset++);
    if (nameLen > 0 && offset + nameLen <= len) {
      const nameBytes = new Uint8Array(buffer, offset, nameLen);
      state.name = new TextDecoder().decode(nameBytes);
      offset += nameLen;
    }
    while (offset < len) {
      const id = view.getUint8(offset++);
      if (id === 0xFE) {
        if (offset >= len) break;
        const count = view.getUint8(offset++);
        for (let i = 0; i < count && i < 12; i++) {
          if (offset + 5 > len) break;
          const freq = view.getUint16(offset, true);
          const gain = view.getInt8(offset + 2);
          const q = view.getUint8(offset + 3) / 10;
          const enabled = view.getUint8(offset + 4) !== 0;
          state.eqPoints.push({ freq, gain, q, enabled });
          offset += 5;
        }
        continue;
      }
      if (offset + 2 > len) break;
      const enabled = view.getUint8(offset++);
      const kCount = view.getUint8(offset++);
      state.effectStates[id] = { enabled: !!enabled, selected: false };
      state.effectParams[id] = {};
      for (let k = 0; k < kCount; k++) {
        if (offset >= len) break;
        state.effectParams[id][`knob${k}`] = view.getUint8(offset++);
      }
      if (offset >= len) break;
      const dCount = view.getUint8(offset++);
      for (let d = 0; d < dCount; d++) {
        if (offset >= len) break;
        state.effectParams[id][`dropdown${d}`] = view.getUint8(offset++);
      }
    }
    return state;
  }
};