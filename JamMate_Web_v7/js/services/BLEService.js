import {crc16} from './WebSync.js?v=15-config-pages';
import {fragments, FrameReceiver} from './Framing.js?v=15-config-pages';
import { Protocol } from './Protocol.js?v=15-config-pages';

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
    _writeChain: Promise.resolve(),
    _frames: new FrameReceiver(),
    _txId: 0,
    _connectionEpoch: 0,
    _waiters: new Set(),
    configReady: false,
    configurationError: null,
    onConfigProgress: null,
    rxNotifications: 0,
    rxRejected: 0,
    _pendingAcks: [],
    request(packet, matches, timeout=15000) {
        return new Promise((resolve,reject)=>{
            const waiter={matches,resolve,reject};
            waiter.timer=setTimeout(()=>{this._waiters.delete(waiter);reject(Error('Device response timed out'));},timeout);
            this._waiters.add(waiter);
            this.send(packet,()=>this._waiters.has(waiter)).catch(e=>{clearTimeout(waiter.timer);this._waiters.delete(waiter);reject(e);});
        });
    },
    _deliver(packet) {
        const bytes=packet instanceof DataView?new Uint8Array(packet.buffer,packet.byteOffset,packet.byteLength):null;
        for(const w of this._waiters){
            if(bytes&&w.matches(bytes)){clearTimeout(w.timer);this._waiters.delete(w);w.resolve(bytes);}
        }
        this.onDataReceived?.(packet);
    },
    _completeFrame(bytes) {
        const cmd=bytes[0];
        if([0x31,0x34,0x38,0x3a,0x55,0x57].includes(cmd) && (bytes.length<3 || (bytes[1]|bytes[2]<<8)!==bytes.length-3))return;
        for(const w of this._waiters){if(w.matches(bytes)){clearTimeout(w.timer);this._waiters.delete(w);w.resolve(bytes);}}
        if([0x31,0x34,0x38,0x3a,0x55,0x57].includes(cmd)) {
            if(bytes.length<3 || (bytes[1]|bytes[2]<<8)!==bytes.length-3)return;
            // Paged config is assembled by readConfiguration before the app
            // sees it. Never validate an individual page as a complete config.
            if(cmd!==0x55||bytes[3]!==2)this.onDataReceived?.({cmd,dataView:new DataView(bytes.buffer,bytes.byteOffset+3,bytes.length-3)});
        }else this._deliver(new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength));
    },

    async _flushAcks(char,epoch){
        while(this._pendingAcks.length){
            const ack=this._pendingAcks.shift();
            if(!this.isConnected||this.characteristic!==char||this._connectionEpoch!==epoch)return;
            if(typeof char.writeValueWithoutResponse==='function')await char.writeValueWithoutResponse(ack);
            else if(typeof char.writeValueWithResponse==='function')await char.writeValueWithResponse(ack);
            else await char.writeValue(ack);
        }
    },
    _queueTransportAck(id,next){
        const ack=Uint8Array.of(0x7f,id&255,id>>8,next&255,next>>8);
        this._pendingAcks.push(ack);
        const char=this.characteristic,epoch=this._connectionEpoch;
        const task=this._writeChain.catch(()=>{}).then(()=>this._flushAcks(char,epoch));
        this._writeChain=task;
        task.catch(e=>console.warn('[BLE] Notification ACK failed',e.message));
        return task;
    },
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
        if (!this._boundDataHandler) this._boundDataHandler = this._handleData.bind(this);
        this.notifyCharacteristic.addEventListener('characteristicvaluechanged', this._boundDataHandler);

        this._connectionEpoch++;
        this._frames.reset();
        this.configReady = false;
        this.rxNotifications=this.rxRejected=0;
        this.configurationError=null;
        this.isConnected = true;
        this._setStatus('connected');

        // Handshake — skip if NAM transfer in progress to avoid triggering rxBuffer assembly
        if (!this._pingBlocked) {
            await this._queueTransportAck(0,0);
            console.log("[BLE] Reading paged device configuration...");
            this._readConfiguration().catch(e=>{
                this.configurationError='Configuration read failed: '+e.message;
                console.error('[CONFIG]',this.configurationError);this._setStatus(this.configurationError);
            });
        }

        // Keep-alive: prevents Windows BLE adapter from suspending idle connections
        this._keepAliveTimer = setInterval(() => {
            if (this.isConnected && !this.isSyncing && !this._pingBlocked) {
                this.send(Protocol.createPing()).catch(() => {});
            }
        }, 10000);
    },

    async _readConfiguration(timeout=4000){
        const deadline=Date.now()+120000;
        let offset=0,expectedCrc=null,assembled=null;
        for(;;){
            let reply;
            for(let attempt=0;attempt<3;attempt++){
                if(Date.now()>deadline)throw Error('Configuration download timed out');
                try{
                    const packet=Uint8Array.of(0x54,4,0,offset&255,offset>>8,96,0);
                    reply=await this.request(packet,b=>b[0]===0x55&&(b[3]===1||(b.length>=10&&b[3]===2&&(b[6]|b[7]<<8)===offset)),timeout);
                    break;
                }catch(e){
                    if(!this.isConnected)throw e;
                    if(attempt===2)throw Error(`Config read stopped at ${offset} bytes; received ${this.rxNotifications} notifications, rejected ${this.rxRejected} frames: ${e.message}`);
                }
            }
            // Backward-compatible with v7.14 firmware's full reply. The normal
            // frame dispatcher already passed that complete v1 reply to app.
            if(reply[3]===1)return reply;
            const total=reply[4]|reply[5]<<8,crc=reply[8]|reply[9]<<8,data=reply.subarray(10);
            if(!total||total>4096||!data.length||data.length>96||offset+data.length>total)throw Error('Invalid configuration page');
            if(!assembled){assembled=new Uint8Array(total);expectedCrc=crc;}
            if(assembled.length!==total||expectedCrc!==crc)throw Error('Device configuration changed during read');
            assembled.set(data,offset);offset+=data.length;
            this.onConfigProgress?.(offset,total);
            if(offset===total){
                if(crc16(assembled)!==expectedCrc)throw Error('Configuration checksum failed');
                const payload=Uint8Array.from([1,...assembled]),frame=new Uint8Array(payload.length+3);
                frame[0]=0x55;frame[1]=payload.length&255;frame[2]=payload.length>>8;frame.set(payload,3);
                this.onDataReceived?.({cmd:0x55,dataView:new DataView(payload.buffer)});
                return frame;
            }
        }
    },
    async readCurrentState(timeout=15000){
        for(let attempt=0;attempt<3;attempt++){
            try{return await this.request(Protocol.createGetState(),b=>b[0]===0x31,timeout);}
            catch(e){if(!this.isConnected||attempt===2)throw e;}
        }
    },
    async disconnect() {
        this.shouldReconnect = false; // [NEW] Intentional disconnect
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        } else {
            this._handleDisconnect();
        }
    },

    async send(data, active=()=>true) {
        if (!this.characteristic || !this.isConnected) {
            throw new Error('BLE is not connected');
        }
        if (!this.configReady && ![0x01,0x52,0x54].includes(new Uint8Array(data.buffer || data, data.byteOffset || 0, data.byteLength)[0])) throw Error(this.configurationError||'Reading device configuration; controls will unlock after verification');
        if (this.isSyncing) {
            throw new Error('BLE is busy syncing');
        }

        // Web Bluetooth permits only one GATT write at a time. Catalog sync,
        // keep-alive and knob events can otherwise collide during connect.
        const char = this.characteristic,epoch=this._connectionEpoch;
        const write = async () => {
            for(const frame of fragments(data,++this._txId)){
                await this._flushAcks(char,epoch);
                if(!active())throw Error('Device request expired');
                if (!this.isConnected || this.characteristic !== char || this._connectionEpoch!==epoch) throw new Error('BLE disconnected');
                if(typeof char.writeValueWithResponse==='function')await char.writeValueWithResponse(frame);
                else await char.writeValue(frame);
                await this._flushAcks(char,epoch);
            }
        };
        const task = this._writeChain.catch(() => {}).then(write);
        this._writeChain = task;
        return task;
    },

    _handleDisconnect() {
        this._connectionEpoch++;
        this._writeChain=Promise.resolve();
        this._pendingAcks=[];
        // Stop keep-alive
        if (this._keepAliveTimer) {
            clearInterval(this._keepAliveTimer);
            this._keepAliveTimer = null;
        }

        // Clear handles (But keep this.device if we want to reconnect)
        if (this.notifyCharacteristic && this._boundDataHandler)
            this.notifyCharacteristic.removeEventListener('characteristicvaluechanged', this._boundDataHandler);
        this.server = null;
        this.characteristic = null;
        this.notifyCharacteristic = null;
        this.isConnected = false;
        this.isSyncing = false;
        
        // Reset Buffer
        this.rxBuffer = null;
        this.rxExpectedLen = 0;
        this.configReady = false;
        this._frames.reset();
        for(const w of this._waiters){clearTimeout(w.timer);w.reject(Error('BLE disconnected'));}
        this._waiters.clear();
        
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
        this.rxNotifications++;
        const view = event.target.value;
        const incoming = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

        if(incoming[0]===0x7e){
            const complete=this._frames.accept(incoming);
            if(this._frames.error){this.rxRejected++;console.warn("[BLE] "+this._frames.error);}
            if(this._frames.ackOffset!==null && this._frames.ackOffset!==undefined){
                const v=new DataView(incoming.buffer,incoming.byteOffset,incoming.length);
                this._queueTransportAck(v.getUint16(2,true),this._frames.ackOffset);
            }
            if(complete)this._completeFrame(complete);
            return;
        }
        // Legacy unframed peers remain readable; config verification prevents edits.
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
        if (cmd === 0x31 || cmd === 0x34 || cmd === 0x38 || cmd === 0x3A) {
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
