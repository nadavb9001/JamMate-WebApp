export const Protocol = {
    // Command IDs
    CMD: {
        SET_PARAM: 0x20, SET_TOGGLE: 0x21, SET_EQ_BAND: 0x22, SET_UTIL: 0x23,
        GET_STATE: 0x30, STATE_DATA: 0x31, SAVE_PRESET: 0x32, LOAD_REQ: 0x33, PRESET_DATA: 0x34, 
        TUNER_DATA: 0x35,
		SET_GLOBAL: 0x25,
        SET_DRUM_PATTERN: 0x40
    },

    createParamUpdate(fxId, paramId, value) {
        const buffer = new ArrayBuffer(6);
        const view = new DataView(buffer);
        view.setUint8(0, this.CMD.SET_PARAM); 
        view.setUint16(1, 3, true);           
        view.setUint8(3, fxId);               
        view.setUint8(4, paramId);            
        view.setUint8(5, Math.round(value));  
        return buffer;
    },

    createToggleUpdate(fxId, isEnabled) {
        const buffer = new ArrayBuffer(5);
        const view = new DataView(buffer);
        view.setUint8(0, this.CMD.SET_TOGGLE);
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
        if (bleEnabled)  flags |= (1 << 1);
        if (flashReq)    flags |= (1 << 2);
        if (resetReq)    flags |= (1 << 3);

        view.setUint8(0, this.CMD.SET_GLOBAL);
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
        view.setUint8(0, this.CMD.SET_EQ_BAND);
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
        view.setUint8(0, this.CMD.SET_UTIL);
        view.setUint16(1, 5, true); 
        view.setUint8(3, type);
        view.setUint8(4, enabled ? 1 : 0);
        view.setUint8(5, Math.round(level));
        view.setUint16(6, Math.round(freq), true); 
        return buffer;
    },

    createGetState() {
        const buffer = new ArrayBuffer(3);
        const view = new DataView(buffer);
        view.setUint8(0, this.CMD.GET_STATE);
        view.setUint16(1, 0, true); 
        return buffer;
    },

    createLoadReq(bank, num) {
        const buffer = new ArrayBuffer(5); 
        const view = new DataView(buffer);
        view.setUint8(0, this.CMD.LOAD_REQ);
        view.setUint16(1, 2, true); 
        view.setUint8(3, bank);
        view.setUint8(4, num);
        return buffer;
    },

    createDrumPatternPacket(patternData) {
        const len = 144;
        const buffer = new ArrayBuffer(3 + len);
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);

        view.setUint8(0, this.CMD.SET_DRUM_PATTERN);
        view.setUint16(1, len, true); 

        let offset = 3;
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 16; col++) {
                bytes[offset++] = patternData[row][col] || 0;
            }
        }
        return buffer;
    },

    createSavePreset(bank, num, appState) {
        const blob = this.serializeState(appState);
        const payloadLen = 2 + blob.byteLength;
        const header = new Uint8Array(5);
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

    serializeState(state) {
        const parts = [];
        const bpm = state.bpm || 120;
        const master = state.master || 100;
        const name = state.name || "User Preset";
        const nameBytes = new TextEncoder().encode(name.substring(0, 32));
        parts.push(new Uint8Array([3, bpm, master, nameBytes.length]));
        parts.push(nameBytes);

        for(let i=0; i<17; i++) {
            const fxState = state.effectStates[i] || { enabled: false };
            const fxParams = state.effectParams[i] || {};
            const kVals = [];
            const dVals = [];
            for(let k=0; k<10; k++) {
                kVals.push(fxParams[`knob${k}`] !== undefined ? fxParams[`knob${k}`] : 50);
            }
            for(let d=0; d<4; d++) {
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
            // UPDATED: Now 5 bytes per point (includes enabled)
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
        const state = { effectStates: {}, effectParams: {}, eqPoints: [], bpm: 120, master: 100, name: "Loaded" };
        if (buffer.byteLength < 4) return state;
        const version = view.getUint8(offset++);
        state.bpm = view.getUint8(offset++);
        state.master = view.getUint8(offset++);
        const nameLen = view.getUint8(offset++);
        if (nameLen > 0 && offset + nameLen <= buffer.byteLength) {
            const nameBytes = new Uint8Array(buffer, offset, nameLen);
            state.name = new TextDecoder().decode(nameBytes);
            offset += nameLen;
        }
        while (offset < buffer.byteLength) {
            const id = view.getUint8(offset);
            
            // EQ TAG 0xFE
            if (id === 0xFE) { 
                offset++;
                if(offset >= buffer.byteLength) break;
                const count = view.getUint8(offset++);
                
                for(let i=0; i<count; i++) {
                    // Try 5-byte format (New)
                    if (offset + 5 <= buffer.byteLength) {
                        const f = view.getUint16(offset, true);
                        const g = view.getInt8(offset + 2);
                        const q = view.getUint8(offset + 3) / 10.0;
                        const en = view.getUint8(offset + 4) !== 0;
                        state.eqPoints.push({ freq: f, gain: g, q: q, enabled: en });
                        offset += 5;
                    } 
                    // Fallback for old blobs (4 bytes)
                    else if (offset + 4 <= buffer.byteLength) {
                        const f = view.getUint16(offset, true);
                        const g = view.getInt8(offset + 2);
                        const q = view.getUint8(offset + 3) / 10.0;
                        state.eqPoints.push({ freq: f, gain: g, q: q, enabled: true });
                        offset += 4;
                    } else {
                        break;
                    }
                }
                continue;
            }
            
            // Standard Effects
            offset++; 
            if (offset + 2 > buffer.byteLength) break;
            const enabled = view.getUint8(offset++);
            const kCount = view.getUint8(offset++);
            state.effectStates[id] = { enabled: !!enabled, selected: false };
            state.effectParams[id] = {};
            for(let k=0; k<kCount; k++) {
                if (offset < buffer.byteLength) state.effectParams[id][`knob${k}`] = view.getUint8(offset++);
            }
            if (offset < buffer.byteLength) {
                const dCount = view.getUint8(offset++);
                for(let d=0; d<dCount; d++) {
                    if (offset < buffer.byteLength) state.effectParams[id][`dropdown${d}`] = view.getUint8(offset++);
                }
            }
        }
        return state;
    }
};