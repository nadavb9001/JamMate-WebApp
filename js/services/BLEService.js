import { Protocol } from './Protocol.js';

export const BLEService = {
    SERVICE_UUID: "6e400001-b5a3-f393-e0a9-e50e24dcca9f",
    CHARACTERISTIC_UUID: "6e400002-b5a3-f393-e0a9-e50e24dcca9f",

    device: null,
    server: null,
    characteristic: null,
    isConnected: false,
    isSyncing: false, // Flag to prevent echo loops

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
        if (this.isSyncing) return; // Block outbound during sync

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
        this._setStatus('disconnected');
    },

    _handleData(event) {
        if (this.onDataReceived) {
            this.onDataReceived(event.target.value);
        }
    },

    _setStatus(status) {
        if (this.onStatusChange) this.onStatusChange(status);
    }
};