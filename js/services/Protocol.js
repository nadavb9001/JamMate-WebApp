export const Protocol = {
    // Command IDs
    CMD: {
        SET_PARAM: 0x20,     // [FxID, ParamID, Val]
        SET_TOGGLE: 0x21,    // [FxID, Enabled]
        SET_EQ_BAND: 0x22,   // [BandIdx, Freq(2), Gain(1), Q(1)]
        GET_STATE: 0x30,     // No payload
        STATE_DATA: 0x31     // Incoming full state
    },

    // 1. Create Knob/Dropdown Update
    createParamUpdate(fxId, paramId, value) {
        const buffer = new ArrayBuffer(6);
        const view = new DataView(buffer);
        
        view.setUint8(0, this.CMD.SET_PARAM); 
        view.setUint16(1, 3, true);           // Payload Len
        
        view.setUint8(3, fxId);               
        view.setUint8(4, paramId);            
        view.setUint8(5, Math.round(value));  
        
        return buffer;
    },

    // 2. Create Toggle Update
    createToggleUpdate(fxId, isEnabled) {
        const buffer = new ArrayBuffer(5);
        const view = new DataView(buffer);
        
        view.setUint8(0, this.CMD.SET_TOGGLE);
        view.setUint16(1, 2, true);           
        
        view.setUint8(3, fxId);
        view.setUint8(4, isEnabled ? 1 : 0);
        
        return buffer;
    },

    // 3. Create EQ Band Update
    createEQUpdate(bandIdx, freq, gain, q) {
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);

        // Constraints matched to ESP32
        const normGain = Math.max(-20, Math.min(20, Math.round(gain))); 
        const normQ = Math.max(0.1, Math.min(16.0, q));                 
        const scaledQ = Math.round(normQ * 10);                         

        view.setUint8(0, this.CMD.SET_EQ_BAND);
        view.setUint16(1, 5, true);           
        
        view.setUint8(3, bandIdx);            
        view.setUint16(4, Math.round(freq), true); // Little Endian
        view.setInt8(6, normGain);            
        view.setUint8(7, scaledQ);            

        return buffer;
    },

    // 4. Request State
    createGetState() {
        const buffer = new ArrayBuffer(3);
        const view = new DataView(buffer);
        view.setUint8(0, this.CMD.GET_STATE);
        view.setUint16(1, 0, true); 
        return buffer;
    }
};
