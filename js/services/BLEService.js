import { Protocol } from './Protocol.js';

export const BLEService = {
    SERVICE_UUID: "6e400001-b5a3-f393-e0a9-e50e24dcca9f",
    CHARACTERISTIC_UUID: "6e400002-b5a3-f393-e0a9-e50e24dcca9f",

    device: null,
    server: null,
    characteristic: null,
    isConnected: false,
    isSyncing: false,

    // Reassembly State
    rxBuffer: null,      // Uint8Array to hold incoming payload
    rxExpectedLen: 0,    // Total bytes expected
    rxCmd: 0,            // The command ID we are waiting for

    onStatusChange: null,
    onDataReceived: null,

    async connect() {
        if (!navigator.bluetooth) {
            alert("Web Bluetooth not supported.");
            return;
        }

        try {
            this._setStatus('connecting');

            this.device = await navigator.bluetooth.requestDevice({
                filters: [{ namePrefix: 'JamMate' }],
                optionalServices: [this.SERVICE_UUID]
            });

            this.device.addEventListener('gattserverdisconnected', this._handleDisconnect.bind(this));
            this.server = await this.device.gatt.connect();
            
            const service = await this.server.getPrimaryService(this.SERVICE_UUID);
            this.characteristic = await service.getCharacteristic(this.CHARACTERISTIC_UUID);

            await this.characteristic.startNotifications();
            this.characteristic.addEventListener('characteristicvaluechanged', this._handleData.bind(this));

            this.isConnected = true;
            this._setStatus('connected');
            
            // Handshake
            console.log("[BLE] Requesting state...");
            this.send(Protocol.createGetState());

        } catch (error) {
            console.error("BLE Connection Failed:", error);
            this._handleDisconnect(); 
        }
    },

    async disconnect() {
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        } else {
            this._handleDisconnect();
        }
    },

    async send(data) {
        if (!this.characteristic || !this.isConnected) return;
        if (this.isSyncing) return; 

        try {
            await this.characteristic.writeValue(data);
        } catch (error) {
            console.error("BLE Write Failed:", error);
        }
    },

    _handleDisconnect() {
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.isConnected = false;
        this.isSyncing = false;
        
        // Reset Buffer
        this.rxBuffer = null;
        this.rxExpectedLen = 0;
        
        this._setStatus('disconnected');
    },

    _handleData(event) {
        const incoming = new Uint8Array(event.target.value.buffer);
        
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
		this.rxBufferOffset = 0;
	},
    _setStatus(status) {
        if (this.onStatusChange) this.onStatusChange(status);
    }
};