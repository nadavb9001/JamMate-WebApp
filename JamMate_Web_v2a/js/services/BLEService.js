import { Protocol } from './Protocol.js';

export const BLEService = {
    // ESP32 Nordic UART Service
    SERVICE_UUID:        "6e400001-b5a3-f393-e0a9-e50e24dcca9f",
    CHARACTERISTIC_UUID: "6e400002-b5a3-f393-e0a9-e50e24dcca9f",

    // JDY-67 / JDY-series custom service
    JDY_SERVICE_UUID: "0000ffe0-0000-1000-8000-00805f9b34fb",
    JDY_WRITE_UUID:   "0000ffe1-0000-1000-8000-00805f9b34fb", // FFE1: transparent UART (write→UART TX, notify←UART RX)
    JDY_NOTIFY_UUID:  "0000ffe1-0000-1000-8000-00805f9b34fb",

    device: null,
    server: null,
    characteristic: null,       // write characteristic
    notifyCharacteristic: null,  // notify characteristic (same as above for NUS, separate for JDY)
    isConnected: false,
    isSyncing: false,
    shouldReconnect: false, // [NEW] Flag to distinguish intentional vs accidental disconnects

    // Reassembly State
    rxBuffer: null,      
    rxExpectedLen: 0,    
    rxCmd: 0,            

    onStatusChange: null,
    onDataReceived: null,

    _keepAliveTimer: null,
    _pingBlocked: false,

    async connect() {
        if (!navigator.bluetooth) {
            alert("Web Bluetooth not supported.");
            return;
        }

        try {
            this._setStatus('connecting');
            this.shouldReconnect = true; // [NEW] User wants to be connected

            // 1. Request Device (User Gesture Required)
            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'JamMate' }, { namePrefix: 'JDY' }],
                optionalServices: [this.SERVICE_UUID, this.JDY_SERVICE_UUID]
            });

            // 2. Setup Disconnect Listener (Once per device instance)
            this.device.addEventListener('gattserverdisconnected', this._handleDisconnect.bind(this));

            // 3. Connect GATT
            await this._connectGatt();

        } catch (error) {
            console.error("BLE Connection Failed:", error);
            this.shouldReconnect = false; // Reset flag on initial failure
            this._handleDisconnect(); 
        }
    },

    // [NEW] Extracted internal connection logic for reuse
    async _connectGatt() {
        if (!this.device) return;

        this.server = await this.device.gatt.connect();

        let writeChar, notifyChar;
        try {
            const svc = await this.server.getPrimaryService(this.SERVICE_UUID);
            writeChar  = await svc.getCharacteristic(this.CHARACTERISTIC_UUID);
            notifyChar = writeChar; // NUS: same characteristic for both directions
        } catch {
            const svc = await this.server.getPrimaryService(this.JDY_SERVICE_UUID);
            writeChar  = await svc.getCharacteristic(this.JDY_WRITE_UUID);
            notifyChar = await svc.getCharacteristic(this.JDY_NOTIFY_UUID);
        }
        this.characteristic       = writeChar;
        this.notifyCharacteristic = notifyChar;

        await this.notifyCharacteristic.startNotifications();
        this.notifyCharacteristic.addEventListener('characteristicvaluechanged', this._handleData.bind(this));

        this.isConnected = true;
        this._setStatus('connected');

        // Handshake — skip if NAM transfer in progress to avoid triggering rxBuffer assembly
        if (!this._pingBlocked) {
            console.log("[BLE] Requesting state...");
            this.send(Protocol.createGetState());
        }

        // Keep-alive: prevents Windows BLE adapter from suspending idle connections
        this._keepAliveTimer = setInterval(() => {
            if (this.isConnected && !this.isSyncing && !this._pingBlocked) {
                this.send(Protocol.createPing()).catch(() => {});
            }
        }, 10000);
    },

    async disconnect() {
        this.shouldReconnect = false; // [NEW] Intentional disconnect
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        } else {
            this._handleDisconnect();
        }
    },

    async send(data) {
        if (!this.characteristic || !this.isConnected) {
            throw new Error('BLE is not connected');
        }
        if (this.isSyncing) {
            throw new Error('BLE is busy syncing');
        }

        try {
            console.log('[BLE TX]', BLEService._decodePacket(data));
            if (typeof this.characteristic.writeValueWithResponse === 'function') {
                await this.characteristic.writeValueWithResponse(data);
            } else {
                await this.characteristic.writeValue(data);
            }
        } catch (error) {
            console.error("BLE Write Failed:", error);
            throw error;
        }
    },

    _handleDisconnect() {
        // Stop keep-alive
        if (this._keepAliveTimer) {
            clearInterval(this._keepAliveTimer);
            this._keepAliveTimer = null;
        }

        // Clear handles (But keep this.device if we want to reconnect)
        this.server = null;
        this.characteristic = null;
        this.notifyCharacteristic = null;
        this.isConnected = false;
        this.isSyncing = false;
        
        // Reset Buffer
        this.rxBuffer = null;
        this.rxExpectedLen = 0;
        
        // [NEW] Auto-Reconnect Logic
        if (this.shouldReconnect && this.device) {
            console.log("[BLE] Connection lost unexpectedly. Attempting reconnect...");
            this._setStatus('reconnecting');
            this._attemptReconnectLoop();
        } else {
            // Intentional disconnect or fatal error
            this.device = null;
            this._setStatus('disconnected');
        }
    },

    // [NEW] Retry Loop
    async _attemptReconnectLoop() {
        const maxRetries = 5;
        const retryDelay = 1500; // 1.5s delay to let ESP32 stack recover

        for (let i = 0; i < maxRetries; i++) {
            if (!this.shouldReconnect || !this.device) break; // Stop if user cancelled

            try {
                console.log(`[BLE] Reconnect attempt ${i + 1}/${maxRetries}...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                
                await this._connectGatt();
                
                console.log("[BLE] Reconnected successfully!");
                return; // Exit loop on success
            } catch (err) {
                console.log(`[BLE] Reconnect attempt ${i + 1} failed:`, err);
            }
        }

        // If we reach here, all retries failed
        console.error("[BLE] Max reconnect attempts reached.");
        this.shouldReconnect = false;
        this.device = null;
        this._setStatus('disconnected');
        alert("Connection lost. Please reconnect manually.");
    },

    _handleData(event) {
        const incoming = new Uint8Array(event.target.value.buffer);

        // Ignore ESP-side heartbeat
        if (incoming.length === 1 && incoming[0] === 0xFF) return;

        // NAM ACKs must never be swallowed by rxBuffer assembly
        const cmd0 = incoming[0];
        if (cmd0 === 0x71 || cmd0 === 0x73 || cmd0 === 0x76) {
            if (this.onDataReceived) this.onDataReceived(event.target.value);
            return;
        }

        // --- REASSEMBLY LOGIC ---

        // Case 1: We are already building a packet
        if (this.rxBuffer) {
            // Append new chunk
            const newBuffer = new Uint8Array(this.rxBuffer.length + incoming.length);
            newBuffer.set(this.rxBuffer);
            newBuffer.set(incoming, this.rxBuffer.length);
            this.rxBuffer = newBuffer;

            // Check if complete
            if (this.rxBuffer.length >= this.rxExpectedLen) {
                this._finalizePacket();
            }
            return;
        }

        // Case 2: New Packet Start
        const cmd = incoming[0];

        // Check if this is a Large Data Command (0x31 or 0x34) that needs reassembly
        if (cmd === 0x31 || cmd === 0x34) {
            // Header format: [CMD, LEN_L, LEN_H]
            if (incoming.length >= 3) {
                const len = incoming[1] | (incoming[2] << 8);
                this.rxExpectedLen = len;
                this.rxCmd = cmd;
                
                // Start buffer with whatever payload data came in this first packet (bytes 3+)
                this.rxBuffer = incoming.slice(3);
                
                // Optimization: If message was small and arrived fully in one packet
                if (this.rxBuffer.length >= this.rxExpectedLen) {
                    this._finalizePacket();
                }
            }
        } 
        else {
            // Single-packet command (like ACK), pass through immediately
            if (this.onDataReceived) {
                this.onDataReceived(event.target.value);
            }
        }
    },

    _finalizePacket() {
		const finalPayloadView = new DataView(this.rxBuffer.buffer.slice(0, this.rxExpectedLen));
		console.log(`[BLE] Reassembled ${this.rxExpectedLen} bytes. Passing to App.`);
		
		if (this.onDataReceived) {
			// Passing the CMD ID and the assembled DataView to the handler
			this.onDataReceived({ cmd: this.rxCmd, dataView: finalPayloadView });
		}
		
		// Reset State
		this.rxExpectedLen = 0;
		this.rxCmd = 0;
		this.rxBuffer = null;
    },
    
    _setStatus(status) {
        if (this.onStatusChange) this.onStatusChange(status);
    },

    _decodePacket(data) {
        const b = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
        const hex = Array.from(b).map(x => x.toString(16).padStart(2,'0')).join(' ');
        const FX = ['GATE','COMP','AWAH','OVRD','DIST','EQUL','HARM','VIBR','CHOR','OCTV','FLNG','PHAS','TREM','_FIR','DELY','_NAM','RVRB','GNRC'];
        const CMD = {
            0x01:'PING', 0x20:'SET_PARAM', 0x21:'SET_TOGGLE', 0x22:'SET_EQ',
            0x23:'SET_UTIL', 0x24:'BYPASS', 0x25:'GLOBAL', 0x30:'GET_STATE',
            0x32:'SAVE_PRESET', 0x33:'LOAD_PRESET', 0x40:'DRUM_PATTERN',
            0x41:'DRUM_UPDATE', 0x42:'LOOP_BTN', 0x43:'USB_MODE',
            0x50:'CONFIG', 0x60:'FLASH', 0x61:'RESET',
            0x70:'NAM_START', 0x72:'NAM_CHUNK', 0x74:'NAM_END',
            0x80:'MIDI_START', 0x81:'MIDI_CHUNK', 0x82:'MIDI_END',
        };
        const cmd  = b[0];
        const name = CMD[cmd] || `CMD_${cmd.toString(16)}`;
        if (cmd === 0x20 && b.length >= 4) {
            const fx    = FX[b[3]] || `fx${b[3]}`;
            const param = b[4];
            const val   = b[5];
            return `${name} ${fx} param=${param} val=${val}  [${hex}]`;
        }
        if (cmd === 0x21 && b.length >= 4) {
            const fx = FX[b[3]] || `fx${b[3]}`;
            const en = b[4];
            return `${name} ${fx} en=${en}  [${hex}]`;
        }
        return `${name}  [${hex}]`;
    },
};
