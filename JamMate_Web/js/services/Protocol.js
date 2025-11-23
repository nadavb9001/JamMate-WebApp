export const Protocol = {
    // Command IDs
CMD: {
        SET_PARAM: 0x20, SET_TOGGLE: 0x21, SET_EQ_BAND: 0x22, SET_UTIL: 0x23,
        GET_STATE: 0x30, STATE_DATA: 0x31, SAVE_PRESET: 0x32, LOAD_REQ: 0x33, PRESET_DATA: 0x34, 
		TUNER_DATA: 0x35  // NEW
    },

    // =========================================================
    // LIVE CONTROLS (Stage 3a)
    // =========================================================

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

    // 3. Create EQ Band Update (Now includes Enabled flag)
    // Packet: [CMD(1) LEN(2) IDX(1) EN(1) FREQ(2) GAIN(1) Q(1)] = 9 bytes
    createEQUpdate(bandIdx, enabled, freq, gain, q) {
        const buffer = new ArrayBuffer(9); 
        const view = new DataView(buffer);

        const normGain = Math.max(-20, Math.min(20, Math.round(gain))); 
        const normQ = Math.max(0.1, Math.min(16.0, q));                 
        const scaledQ = Math.round(normQ * 10);                         

        view.setUint8(0, this.CMD.SET_EQ_BAND);
        view.setUint16(1, 6, true);           // Payload Len = 6 bytes
        
        view.setUint8(3, bandIdx);            
        view.setUint8(4, enabled ? 1 : 0);    // NEW: Enabled Flag
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

    // =========================================================
    // PRESET MANAGEMENT (Stage 3c) - THIS WAS MISSING
    // =========================================================

    // 1. Request Load (0x33)
    createLoadReq(bank, num) {
        const buffer = new ArrayBuffer(5); 
        const view = new DataView(buffer);
        view.setUint8(0, this.CMD.LOAD_REQ);
        view.setUint16(1, 2, true); // Len = 2 bytes
        view.setUint8(3, bank);
        view.setUint8(4, num);
        return buffer;
    },

    // 2. Save Preset (0x32)
    createSavePreset(bank, num, appState) {
        const blob = this.serializeState(appState);
        // Payload: Bank(1) + Num(1) + Blob(...)
        const payloadLen = 2 + blob.byteLength;
        
        const header = new Uint8Array(5);
        header[0] = this.CMD.SAVE_PRESET;
        header[1] = payloadLen & 0xFF;
        header[2] = (payloadLen >> 8) & 0xFF;
        header[3] = bank;
        header[4] = num;

        // Merge
        const packet = new Uint8Array(header.length + blob.byteLength);
        packet.set(header);
        packet.set(new Uint8Array(blob), 5);
        
        return packet;
    },

    // =========================================================
    // SERIALIZATION LOGIC (Blob Handling)
    // =========================================================

    serializeState(state) {
        const parts = [];
        
        // 1. Metadata [Ver(1), BPM(1), Master(1), NameLen(1), Name(...)]
        const bpm = state.bpm || 120;
        const master = state.master || 100;
        const name = state.name || "User Preset";
        
        const nameBytes = new TextEncoder().encode(name.substring(0, 32));
        
        parts.push(new Uint8Array([3, bpm, master, nameBytes.length]));
        parts.push(nameBytes);

        // 2. Effects Loop [ID, En, K_Count, K_Vals..., D_Count, D_Vals...]
        for(let i=0; i<17; i++) {
            const fxState = state.effectStates[i] || { enabled: false };
            const fxParams = state.effectParams[i] || {};
            
            const kVals = [];
            const dVals = [];
            
            // Scan knobs (0-9)
            for(let k=0; k<10; k++) {
                kVals.push(fxParams[`knob${k}`] !== undefined ? fxParams[`knob${k}`] : 50);
            }
            // Scan drops (0-3)
            for(let d=0; d<4; d++) {
                dVals.push(fxParams[`dropdown${d}`] !== undefined ? fxParams[`dropdown${d}`] : 0);
            }

            const header = new Uint8Array([i, fxState.enabled ? 1 : 0, kVals.length]);
            parts.push(header);
            parts.push(new Uint8Array(kVals));
            parts.push(new Uint8Array([dVals.length]));
            parts.push(new Uint8Array(dVals));
        }

        // 3. EQ Tag [0xFE, Count, Data...]
        if (state.eqPoints && state.eqPoints.length > 0) {
            parts.push(new Uint8Array([0xFE, state.eqPoints.length]));
            const eqBuf = new ArrayBuffer(state.eqPoints.length * 4);
            const eqView = new DataView(eqBuf);
            
            state.eqPoints.forEach((pt, i) => {
                const off = i * 4;
                eqView.setUint16(off, Math.round(pt.freq), true);
                eqView.setInt8(off + 2, Math.round(pt.gain));
                eqView.setUint8(off + 3, Math.round(pt.q * 10));
            });
            parts.push(new Uint8Array(eqBuf));
        }

        // Flatten
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
            
            if (id === 0xFE) { // EQ
                offset++;
                if(offset >= buffer.byteLength) break;
                const count = view.getUint8(offset++);
                for(let i=0; i<count; i++) {
                    if (offset + 4 > buffer.byteLength) break;
                    const f = view.getUint16(offset, true);
                    const g = view.getInt8(offset + 2);
                    const q = view.getUint8(offset + 3) / 10.0;
                    state.eqPoints.push({ freq: f, gain: g, q: q });
                    offset += 4;
                }
                continue;
            }

            // Effect
            offset++; 
            if (offset + 2 > buffer.byteLength) break;
            
            const enabled = view.getUint8(offset++);
            const kCount = view.getUint8(offset++);
            
            // Init state objects
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