// ===================================================================
// JamMate Multi-Effect Controller - Firmware v3.3 (LittleFS)
// Protocol: Command-Based (v3) + Binary Stream Blobs
// Storage: Hybrid (Factory=Structs, Custom=Blobs on LittleFS)
// ===================================================================

#include "PresetBinary_v2.hpp"  // Updated struct definition with EQPoints
#include "BluetoothManager_binary.hpp"
#include "MyRotaryEncoder.h"
#include <LittleFS.h> 

// Pin Definitions
#define ENCODER1_PIN_A 19
#define ENCODER1_PIN_B 18
#define ENCODER1_BTN 5
#define ENCODER2_PIN_A 34
#define ENCODER2_PIN_B 22
#define ENCODER2_BTN 23
#define SWITCH1_PIN 26
#define SWITCH2_PIN 2
#define SWITCH3_PIN 26
#define SWITCH4_PIN 26
#define DSP_TX_PIN 33
#define DSP_RX_PIN 25

// Config
#define SAVE_INTERVAL 5000
#define MAX_BLOB_SIZE 1024  // Max preset size

// ===================================================================
// DEVELOPMENT MODE
// ===================================================================
bool presetsLocked = false;

// Globals
BluetoothManager btManager;
RotaryEncoder encoder1(ENCODER1_PIN_A, ENCODER1_PIN_B, ENCODER1_BTN);
RotaryEncoder encoder2(ENCODER2_PIN_A, ENCODER2_PIN_B, ENCODER2_BTN);
HardwareSerial dspSerial(2);

struct SystemState {
  uint8_t currentBank;
  uint8_t currentPresetNum;
  uint8_t volume;
  bool a2dpEnabled;
  bool switchStates[4];
} state;

Preset currentPreset;
uint8_t blobBuffer[MAX_BLOB_SIZE];

// Variables
int lastEncoder1Pos = 0;
int lastEncoder2Pos = 0;
unsigned long lastEncoder1BtnTime = 0;
unsigned long lastEncoder2BtnTime = 0;
const unsigned long DEBOUNCE_TIME = 200;
unsigned long lastSaveTime = 0;

// Forward Declarations
void sendToDSP(const char cmd[4], uint8_t* payload, size_t len);
void sendEffectChangeToDSP(uint8_t idx, uint8_t en, const uint8_t* k, const uint8_t* d);
void sendEQBandToDSP(uint8_t b, uint8_t enabled, uint16_t f, int8_t g, uint8_t q);
void updateDSPFromPreset();

// ===================================================================
// BLOB SERIALIZATION (Struct <-> Binary Stream)
// ===================================================================

// Convert Internal Struct -> Protocol v3 Blob
size_t serializeStructToBlob(const Preset& p, uint8_t* buf) {
    size_t offset = 0;

    // 1. Header
    buf[offset++] = 0x03; // Version
    buf[offset++] = p.bpm;
    buf[offset++] = p.masterVolume;

    size_t nameLen = strlen(p.name);
    buf[offset++] = nameLen;
    memcpy(&buf[offset], p.name, nameLen);
    offset += nameLen;

    // 2. Effects Loop
    for (int i = 0; i < MAX_EFFECTS; i++) {
        buf[offset++] = i; // ID
        buf[offset++] = p.effects[i].enabled ? 1 : 0;

        buf[offset++] = 10; // Knob Count
        memcpy(&buf[offset], p.effects[i].knobs, 10);
        offset += 10;

        buf[offset++] = 4; // Drop Count
        memcpy(&buf[offset], p.effects[i].dropdowns, 4);
        offset += 4;
    }

    // --- FIX: Save EQ Data ---
    // Tag 0xFE indicates EQ block start in Protocol v3
    buf[offset++] = 0xFE; 
    buf[offset++] = 12; // Count (Always 12 bands)
    
    for(int i=0; i<12; i++) {
        // Write 4 bytes per band: [FreqL, FreqH, Gain, Q]
        buf[offset++] = (uint8_t)(p.eqPoints[i].freq & 0xFF);
        buf[offset++] = (uint8_t)(p.eqPoints[i].freq >> 8);
        buf[offset++] = (uint8_t)p.eqPoints[i].gain;
        buf[offset++] = p.eqPoints[i].q;
        // Note: 'enabled' state is assumed true if present in blob for simplicity,
        // or could be encoded if you modify protocol further.
    }

    return offset;
}

// Parse Protocol v3 Blob -> Internal Struct
void parseBlobToStruct(const uint8_t* buf, size_t len, Preset& p) {
    if (len < 4) return;
    size_t offset = 0;

    // 1. Header
    uint8_t ver = buf[offset++];
    p.bpm = buf[offset++];
    p.masterVolume = buf[offset++];

    uint8_t nameLen = buf[offset++];
    if (offset + nameLen <= len) {
        memset(p.name, 0, 32);
        memcpy(p.name, &buf[offset], min((size_t)nameLen, (size_t)31));
        offset += nameLen;
    }

    // --- FIX: Initialize EQ Defaults ---
    // Essential to prevent garbage data if the loaded preset lacks EQ block
    for(int i=0; i<12; i++) {
        p.eqPoints[i].freq = (i==0) ? 80 : (i==11) ? 8000 : (100 * (i+1));
        p.eqPoints[i].gain = 0;
        p.eqPoints[i].q = 14; // 1.4
        p.eqPoints[i].enabled = true;
    }

    // 2. Parse Blocks
    while (offset < len) {
        uint8_t id = buf[offset++];

        // --- FIX: Parse EQ Tag ---
        if (id == 0xFE) {
            if (offset >= len) break;
            uint8_t count = buf[offset++];
            
            for(int i=0; i<count && i<12; i++) {
                if (offset + 4 > len) break;
                
                uint16_t freq = buf[offset] | (buf[offset+1] << 8);
                int8_t gain = (int8_t)buf[offset+2];
                uint8_t q = buf[offset+3];
                
                p.eqPoints[i].freq = freq;
                p.eqPoints[i].gain = gain;
                p.eqPoints[i].q = q;
                p.eqPoints[i].enabled = true; 
                
                offset += 4;
            }
            continue;
        }

        // Standard Effects
        if (offset + 2 > len) break;
        uint8_t enabled = buf[offset++];
        uint8_t kCount = buf[offset++];

        if (id < MAX_EFFECTS) {
            p.effects[id].enabled = (enabled != 0);
            for (int k = 0; k < kCount; k++) {
                if (offset < len) {
                    uint8_t val = buf[offset++];
                    if (k < 10) p.effects[id].knobs[k] = val;
                }
            }
            if (offset < len) {
                uint8_t dCount = buf[offset++];
                for (int d = 0; d < dCount; d++) {
                    if (offset < len) {
                        uint8_t val = buf[offset++];
                        if (d < 4) p.effects[id].dropdowns[d] = val;
                    }
                }
            }
        } else {
            // Unknown Effect (Skip)
            offset += kCount;
            if (offset < len) {
                uint8_t dCount = buf[offset++];
                offset += dCount;
            }
        }
    }
}

// ===================================================================
// DSP Comm Handler
// ===================================================================

// Global Parser State
enum DSPState { WAIT_HEADER, WAIT_LEN, READ_PAYLOAD };
DSPState dspState = WAIT_HEADER;
char dspHeader[5]; 
uint32_t dspPayloadLen = 0;
uint32_t dspBytesRead = 0;
uint8_t* dspBuffer = nullptr; 

void checkDSPIncoming() {
  while (dspSerial.available()) {
    switch (dspState) {
      case WAIT_HEADER:
        if (dspSerial.available() >= 4) {
          dspSerial.readBytes(dspHeader, 4);
          dspHeader[4] = 0; 
          dspState = WAIT_LEN;
        }
        break;
      case WAIT_LEN:
        if (dspSerial.available() >= 4) {
          dspSerial.readBytes((char*)&dspPayloadLen, 4); 
          if (dspPayloadLen > 10240) {
            Serial.printf("[DSP] Error: Payload too huge (%d)\n", dspPayloadLen);
            dspState = WAIT_HEADER; 
            break;
          }
          if (dspBuffer) free(dspBuffer);
          dspBuffer = (uint8_t*)malloc(dspPayloadLen);
          dspBytesRead = 0;
          dspState = READ_PAYLOAD;
        }
        break;
      case READ_PAYLOAD:
        while (dspSerial.available() && dspBytesRead < dspPayloadLen) {
          dspBuffer[dspBytesRead++] = dspSerial.read();
        }
        if (dspBytesRead >= dspPayloadLen) {
          processDSPPacket(dspHeader, dspBuffer, dspPayloadLen);
          free(dspBuffer);
          dspBuffer = nullptr;
          dspState = WAIT_HEADER;
        }
        break;
    }
  }
}

void processDSPPacket(const char* header, uint8_t* data, uint32_t len) {
  if (strcmp(header, "TUNE") == 0 && len == 4) {
      uint8_t packet[7];
      packet[0] = 0x35; 
      packet[1] = 4;
      packet[2] = 0;
      memcpy(&packet[3], data, 4);
      btManager.sendBLEData(packet, 7);
  }
  else if (strcmp(header, "LOAD") == 0) {
    float load;
    memcpy(&load, data, 4);
    Serial.printf("[DSP] CPU Load: %.1f%%\n", load * 100.0f);
  }
}

// ===================================================================
// BLE Handler
// ===================================================================
void onBLEDataReceived(uint8_t* data, size_t len) {
  if (len < 3) return;
  uint8_t cmd = data[0];
  uint16_t payloadLen = data[1] | (data[2] << 8);
  if (len < payloadLen + 3) return;
  uint8_t* payload = &data[3];

  switch (cmd) {
    // --- LIVE CONTROLS ---
    case 0x20: { // Param
        uint8_t fx = payload[0];
        uint8_t pid = payload[1];
        uint8_t val = payload[2];
        if (fx < MAX_EFFECTS) {
          if (pid < 10) currentPreset.effects[fx].knobs[pid] = val;
          else currentPreset.effects[fx].dropdowns[pid - 10] = val;
          sendEffectChangeToDSP(fx, currentPreset.effects[fx].enabled,
                                currentPreset.effects[fx].knobs, currentPreset.effects[fx].dropdowns);
        }
        break;
      }
    case 0x21: { // Toggle
        uint8_t fx = payload[0];
        uint8_t en = payload[1];
        if (fx < MAX_EFFECTS) {
          currentPreset.effects[fx].enabled = (en != 0);
          sendEffectChangeToDSP(fx, en, currentPreset.effects[fx].knobs, currentPreset.effects[fx].dropdowns);
        }
        break;
      }
    // ============================================================
    // 0x22: SET_EQ_BAND (IIR Update)
    // Payload: [BandIdx(1), En(1), Freq(2), Gain(1), Q(1)]
    // ============================================================
    case 0x22: {
        uint8_t bandIdx = payload[0];
        uint8_t enabled = payload[1];
        uint16_t freq = payload[2] | (payload[3] << 8);
        int8_t gain = (int8_t)payload[4];
        uint8_t q = payload[5];

        // --- FIX: Update Internal RAM so we don't lose this change if we save later ---
        if(bandIdx < 12) {
            currentPreset.eqPoints[bandIdx].freq = freq;
            currentPreset.eqPoints[bandIdx].gain = gain;
            currentPreset.eqPoints[bandIdx].q = q;
            currentPreset.eqPoints[bandIdx].enabled = (enabled != 0);
        }
        delay(10);
        sendEQBandToDSP(bandIdx, enabled, freq, gain, q);
        
        break;
    }
    case 0x23: { // Util
        uint8_t t = payload[0];
        uint8_t en = payload[1];
        uint8_t lv = payload[2];
        uint16_t f = payload[3] | (payload[4] << 8);
        uint8_t p[5] = { t, en, lv, (uint8_t)(f >> 8), (uint8_t)(f & 0xFF) };
        delay(10);
        sendToDSP("UTIL", p, 5);
        break;
      }
    case 0x25: { // Global
        if (payloadLen < 4) break;
        uint8_t master = payload[0];
        uint8_t btVol = payload[1];
        uint8_t bpm = payload[2];
        uint8_t flags = payload[3];

        currentPreset.masterVolume = master;
        currentPreset.bpm = bpm;

        bool a2dpReq = (flags & 0x01);
        if (state.a2dpEnabled != a2dpReq) {
          state.a2dpEnabled = a2dpReq;
          if (state.a2dpEnabled) btManager.enableA2DP();
          else btManager.disableA2DP();
        }

        uint8_t dspPayload[13] = { 0 };
        dspPayload[0] = master; dspPayload[1] = btVol; dspPayload[2] = bpm; dspPayload[3] = flags;
        btManager.setA2DPvolume(btVol);
        delay(10);
        sendToDSP("GEN ", dspPayload, 4);
        break;
      }
    case 0x30: { // Handshake
        size_t size = serializeStructToBlob(currentPreset, blobBuffer);
        uint8_t head[3] = { 0x31, (uint8_t)(size & 0xFF), (uint8_t)(size >> 8) };
        btManager.sendBLEData(head, 3);
        btManager.sendBLEDataChunked(blobBuffer, size);
        Serial.println("[BLE] Sent Handshake State");
        break;
      }
    case 0x32: { // SAVE_PRESET
        uint8_t bank = payload[0];
        uint8_t num = payload[1];
        uint8_t* blob = &payload[2];
        size_t blobSize = payloadLen - 2;

        if (presetsLocked && bank < 5) break;

        char fname[32];
        if (bank < 5) snprintf(fname, 32, "/presets/f_%d_%d.bin", bank, num);
        else snprintf(fname, 32, "/presets/c_%d_%d.bin", bank - 5, num);

        File f = LittleFS.open(fname, "w");
        if (f) {
          f.write(blob, blobSize);
          f.close();
          Serial.printf("[BLE] Saved %s (%d bytes)\n", fname, blobSize);

          parseBlobToStruct(blob, blobSize, currentPreset);
          currentPreset.bank = bank;
          currentPreset.number = num;
          updateDSPFromPreset();
        }
        break;
      }
    case 0x33: { // LOAD_REQ
        uint8_t bank = payload[0];
        uint8_t num = payload[1];
        char fname[32];

        if (bank < 5) snprintf(fname, 32, "/presets/f_%d_%d.bin", bank, num);
        else snprintf(fname, 32, "/presets/c_%d_%d.bin", bank - 5, num);

        if (LittleFS.exists(fname)) {
          File f = LittleFS.open(fname, "r");
          if (f) {
            size_t size = f.read(blobBuffer, MAX_BLOB_SIZE);
            f.close();

            uint8_t head[3] = { 0x34, (uint8_t)(size & 0xFF), (uint8_t)(size >> 8) };
            btManager.sendBLEData(head, 3);
            btManager.sendBLEDataChunked(blobBuffer, size);

            parseBlobToStruct(blobBuffer, size, currentPreset);
            currentPreset.bank = bank;
            currentPreset.number = num;
            updateDSPFromPreset();
            Serial.printf("[BLE] Loaded %s\n", fname);
          }
        }
        break;
      }
  }
}

// ===================================================================
// DSP Helpers
// ===================================================================
void sendToDSP(const char cmd[4], uint8_t* payload, size_t len) {
  uint8_t buf[17] = { 0 };
  memcpy(buf, cmd, 4);
  if (payload && len > 0) memcpy(buf + 4, payload, min(len, (size_t)13));
  dspSerial.write(buf, 17);
}

void sendEffectChangeToDSP(uint8_t idx, uint8_t en, const uint8_t* k, const uint8_t* d) {
  const char* name;
  if (idx < MAX_EFFECTS) name = EFFECT_NAMES[idx];
  else name = "GEN ";

  uint8_t buf[17] = { 0 };
  memcpy(buf, name, 4);
  buf[4] = en ? 1 : 0;

  if (strncmp(name, "FIR ", 4) == 0) {
    if (k) memcpy(&buf[5], k, 7);
    if (d) { buf[12]=d[0]; buf[13]=d[1]; buf[14]=d[2]; buf[15]=d[3]; }
  } else {
    if (k) memcpy(&buf[5], k, 10);
    if (d) { buf[15]=d[0]; buf[16]=d[1]; }
  }
  delay(10);
  dspSerial.write(buf, 17);
}

void sendEQBandToDSP(uint8_t b, uint8_t enabled, uint16_t f, int8_t g, uint8_t q) {
  char h[5];
  if (b == 0) strcpy(h, "EQHP");
  else if (b == 11) strcpy(h, "EQLP");
  else snprintf(h, 5, "EQ%02d", b);

  uint8_t p[5] = { enabled, (uint8_t)(f >> 8), (uint8_t)(f & 0xFF), (uint8_t)g, q };
  sendToDSP(h, p, 5);
}

void updateDSPFromPreset() {
  uint8_t p[13] = { currentPreset.bank, currentPreset.number, currentPreset.masterVolume, currentPreset.bpm };
  sendToDSP("PRES", p, 13);

  for (int i = 0; i < MAX_EFFECTS; i++) {
    sendEffectChangeToDSP(i, currentPreset.effects[i].enabled,
                          currentPreset.effects[i].knobs, currentPreset.effects[i].dropdowns);
    delay(5); 
  }

  // --- FIX: Update EQ Bands on DSP ---
  // Iterate 12 bands and send updates to the DSP
  for (int i = 0; i < 12; i++) {
     sendEQBandToDSP(i, 
        currentPreset.eqPoints[i].enabled ? 1 : 0, 
        currentPreset.eqPoints[i].freq, 
        currentPreset.eqPoints[i].gain, 
        currentPreset.eqPoints[i].q
     );
     delay(10); // Short delay to prevent buffer overflow
  }
}

// ===================================================================
// LittleFS & Persistence
// ===================================================================
void initializeFactoryPresets() {
  if (LittleFS.exists("/presets/factory_v3.flag")) {
    Serial.println("[PRESETS] Factory presets already up to date.");
    return;
  }

  Serial.println("[PRESETS] Generating new Factory Presets...");
  if (!LittleFS.exists("/presets")) LittleFS.mkdir("/presets");

  const char* bankNames[] = { "Clean", "Crunch", "Overdrive", "Distortion", "Modulated", "Custom1", "Custom2" };

  for (int bank = 0; bank < 5; bank++) {
    for (int num = 0; num < 5; num++) {
      Preset p;
      memset(&p, 0, sizeof(Preset));
      snprintf(p.name, 32, "%s %d", bankNames[bank], num + 1);
      p.bank = bank;
      p.number = num;
      p.masterVolume = 100;
      p.bpm = 120;

      // --- FIX: Initialize EQ Defaults ---
      // Initialize sensible EQ defaults for factory presets
      for(int i=0; i<12; i++) {
        p.eqPoints[i].freq = (i==0) ? 80 : (i==11) ? 8000 : (100 * (i+1));
        p.eqPoints[i].gain = 0;
        p.eqPoints[i].q = 14; 
        p.eqPoints[i].enabled = true;
      }

      if (bank == 0) {  // CLEAN
        p.effects[13].enabled = true;
        p.effects[13].knobs[6] = 30;
        p.effects[13].dropdowns[0] = 1;
        p.effects[16].enabled = true;
        p.effects[16].knobs[0] = 40;
        p.effects[1].enabled = true;
        p.effects[1].knobs[0] = 60;
      } else if (bank == 1) {  // CRUNCH
        p.effects[3].enabled = true;
        p.effects[3].knobs[1] = 70;
        p.effects[13].enabled = true;
        p.effects[13].dropdowns[0] = 3;
      } else if (bank == 3) {  // DISTORTION
        p.effects[0].enabled = true;
        p.effects[4].enabled = true;
        p.effects[4].knobs[1] = 90;
        p.effects[4].dropdowns[0] = 2;
        p.effects[14].enabled = true;
      }

      char filename[32];
      snprintf(filename, 32, "/presets/f_%d_%d.bin", bank, num);
      File file = LittleFS.open(filename, "w");
      if (file) {
        size_t size = serializeStructToBlob(p, blobBuffer);
        file.write(blobBuffer, size);
        file.close();
      }
    }
  }

  File flagFile = LittleFS.open("/presets/factory_v3.flag", "w");
  if (flagFile) {
    flagFile.print("done");
    flagFile.close();
  }
  Serial.println("[PRESETS] ✓ Generation Complete.");
}

bool loadPreset(uint8_t bank, uint8_t number, Preset& preset) {
  if (bank > 6 || number > 4) return false;
  char filename[64];
  if (bank < 5) snprintf(filename, sizeof(filename), "/presets/f_%d_%d.bin", bank, number);
  else snprintf(filename, sizeof(filename), "/presets/c_%d_%d.bin", bank - 5, number);

  File file = LittleFS.open(filename, "r");
  if (!file) return false;

  size_t size = file.read(blobBuffer, MAX_BLOB_SIZE);
  file.close();

  parseBlobToStruct(blobBuffer, size, preset);
  return true;
}

void saveSystemState() {
  File file = LittleFS.open("/state.dat", "w");
  if (file) {
    file.write((uint8_t*)&state, sizeof(SystemState));
    file.close();
  }
}

void loadSystemState() {
  File file = LittleFS.open("/state.dat", "r");
  if (file) {
    file.read((uint8_t*)&state, sizeof(SystemState));
    file.close();
  } else {
    state.currentBank = 0;
    state.currentPresetNum = 0;
    state.volume = 127;
    state.a2dpEnabled = true;
    for (int i = 0; i < 4; i++) state.switchStates[i] = false;
  }

  if (!loadPreset(state.currentBank, state.currentPresetNum, currentPreset)) {
    memset(&currentPreset, 0, sizeof(Preset));
  }
}

// ===================================================================
// Hardware Setup (Switches, Encoders, Loop)
// ===================================================================
void setupSwitches() {
  const int switchPins[4] = { SWITCH1_PIN, SWITCH2_PIN, SWITCH3_PIN, SWITCH4_PIN };
  for (int i = 0; i < 4; i++) pinMode(switchPins[i], INPUT_PULLUP);
}

void sendSwitchStateToDSP(int switchIndex, bool switchState) {
  uint8_t payload[13] = { 0 };
  payload[0] = switchIndex;
  payload[1] = switchState ? 1 : 0;
  sendToDSP("SWCH", payload, 2);
}

void handleSwitches() {
  static bool switchLastState[4] = { false };
  const int switchPins[4] = { SWITCH1_PIN, SWITCH2_PIN, SWITCH3_PIN, SWITCH4_PIN };
  for (int i = 0; i < 4; i++) {
    bool currentState = digitalRead(switchPins[i]) == LOW;
    if (currentState != switchLastState[i]) {
      switchLastState[i] = currentState;
      state.switchStates[i] = currentState;
      sendSwitchStateToDSP(i, currentState);
    }
  }
}

void handleEncoders() {
  int enc1Pos = encoder1.getPosition();
  if (enc1Pos != lastEncoder1Pos) {
    state.currentBank = constrain(state.currentBank + (enc1Pos - lastEncoder1Pos), 0, 6);
    lastEncoder1Pos = enc1Pos;
    Serial.printf("[ENC1] Bank: %d\n", state.currentBank);
  }

  if (encoder1.isButtonPressed() && (millis() - lastEncoder1BtnTime > DEBOUNCE_TIME)) {
    if (loadPreset(state.currentBank, state.currentPresetNum, currentPreset)) {
      updateDSPFromPreset();
      // Sync Web
      size_t size = serializeStructToBlob(currentPreset, blobBuffer);
      uint8_t head[3] = { 0x31, (uint8_t)(size & 0xFF), (uint8_t)(size >> 8) };
      btManager.sendBLEData(head, 3);
      btManager.sendBLEDataChunked(blobBuffer, size);
    }
    lastEncoder1BtnTime = millis();
  }

  int enc2Pos = encoder2.getPosition();
  if (enc2Pos != lastEncoder2Pos) {
    state.currentPresetNum = constrain(state.currentPresetNum + (enc2Pos - lastEncoder2Pos), 0, 4);
    lastEncoder2Pos = enc2Pos;
    Serial.printf("[ENC2] Num: %d\n", state.currentPresetNum);
  }

  if (encoder2.isButtonPressed() && (millis() - lastEncoder2BtnTime > DEBOUNCE_TIME)) {
    state.a2dpEnabled = !state.a2dpEnabled;
    if (state.a2dpEnabled) btManager.enableA2DP();
    else btManager.disableA2DP();
    lastEncoder2BtnTime = millis();
  }
}

void setup() {
  Serial.begin(115200);
  if (!LittleFS.begin(true)) {
    Serial.println("[FS] Mount Failed, formatting...");
  }

  initializeFactoryPresets();
  loadSystemState();

  encoder1.begin();
  encoder2.begin();
  setupSwitches();

  dspSerial.begin(115200, SERIAL_8N1, DSP_RX_PIN, DSP_TX_PIN);

  i2s_pin_config_t pins = { .mck_io_num = 0, .bck_io_num = 14, .ws_io_num = 13, .data_out_num = 12, .data_in_num = 35 };
  btManager.setA2DPPinConfig(pins);
  btManager.begin("JamMate", state.a2dpEnabled);
  btManager.setBLEDataCallback(onBLEDataReceived);
  btManager.setCurrentPreset(&currentPreset);

  Serial.println("[JamMate] v3.3 (LittleFS) Ready");
  updateDSPFromPreset();
  lastSaveTime = millis();
}

void loop() {
  encoder1.update();
  encoder2.update();
  handleEncoders();
  handleSwitches();
  checkDSPIncoming(); 

  if (millis() - lastSaveTime > SAVE_INTERVAL) {
    saveSystemState();
    lastSaveTime = millis();
  }
  delay(1);
}