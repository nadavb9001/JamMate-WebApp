// ===================================================================
// JamMate Multi-Effect Controller - Firmware v3.3 (LittleFS)
// Protocol: Command-Based (v3) + Binary Stream Blobs
// Storage: Hybrid (Factory=Structs, Custom=Blobs on LittleFS)
// ===================================================================

#include "PresetBinary_v2.hpp"  // Updated struct definition with EQPoints
#include "BluetoothManager_binary.hpp"
#include "MyRotaryEncoder.h"
#include <LittleFS.h>
#include "DisplayManager.h"


// Pin Definitions
#define ENCODER1_PIN_A 19
#define ENCODER1_PIN_B 18
#define ENCODER1_BTN 5
#define ENCODER2_PIN_A 34
#define ENCODER2_PIN_B 22
#define ENCODER2_BTN 23
#define SWITCH1_PIN 26
#define SWITCH2_PIN 2
#define DSP_TX_PIN 33
#define DSP_RX_PIN 25

// Config
#define SAVE_INTERVAL 5000
#define MAX_BLOB_SIZE 1024  // Max preset size

// Configuration
const int FRAME_COUNT = 45;  // Change this to match your total number of frames
const int FPS_DELAY = 0;     // Delay between frames (0 = max speed)

// =========================================================================
//  TJpg_Decoder Callback Function
//  This function is called by the decoder to render the image blocks
// =========================================================================
bool tft_output(int16_t x, int16_t y, uint16_t w, uint16_t h, uint16_t* bitmap) {
  // Stop further decoding as image is out of screen bounds
  if (y >= display.tft.height()) return 0;

  // This function automatically clips the image block rendering at screen bounds
  display.tft.pushImage(x, y, w, h, bitmap);

  // Return 1 to decode the next block
  return 1;
}
// ===================================================================
// FX LAYOUT TABLE (Knob Count, Dropdown Count)
// Match order in config.js
// ===================================================================
const uint8_t FX_LAYOUT[18][2] = {
  { 5, 0 },   // 0: Gate
  { 8, 0 },   // 1: Comp
  { 7, 0 },   // 2: Awah
  { 10, 2 },  // 3: Ovrd
  { 10, 2 },  // 4: Dist
  { 10, 2 },  // 5: Equl
  { 6, 4 },   // 6: Harm
  { 3, 0 },   // 7: Vibr
  { 7, 0 },   // 8: Chor
  { 5, 2 },   // 9: Octv
  { 5, 0 },   // 10: Flng
  { 7, 1 },   // 11: Phas
  { 4, 2 },   // 12: Trem
  { 6, 5 },   // 13: FIR  (6 Knobs, 5 Drops: amp, tone, points, type, file)
  { 9, 3 },   // 14: Dely (9 Knobs, 3 Drops: type, div, multi)
  { 2, 1 },   // 15: NAM  (2 Knobs, 1 Drop: model)
  { 10, 2 },  // 16: Rvrb
  { 10, 2 }   // 17: Gnrc (Generic)
};

// ===================================================================
// DEVELOPMENT MODE
// ===================================================================
bool presetsLocked = false;

// Globals
BluetoothManager btManager;
RotaryEncoder encoder1(ENCODER1_PIN_A, ENCODER1_PIN_B, ENCODER1_BTN);
RotaryEncoder encoder2(ENCODER2_PIN_A, ENCODER2_PIN_B, ENCODER2_BTN);
PushSwitch switch1(SWITCH1_PIN);
PushSwitch switch2(SWITCH2_PIN);
HardwareSerial dspSerial(2);

#define MAX_DSP_PAYLOAD 10240
uint8_t dspBuffer_static[MAX_DSP_PAYLOAD];  // ← Pre-allocated
uint32_t dspBytesRead = 0;
//uint32_t dspPayloadLen = 0;
uint32_t dspTimeout = 0;

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
  buf[offset++] = 0x03;  // Version
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

    // [FIX] Use Macro instead of hardcoded '10'
    buf[offset++] = MAX_EFFECT_KNOBS; 
    memcpy(&buf[offset], p.effects[i].knobs, MAX_EFFECT_KNOBS);
    offset += MAX_EFFECT_KNOBS;

    // [FIX] Use Macro instead of hardcoded '4' (This was causing the FIR bug)
    buf[offset++] = MAX_EFFECT_DROPDOWNS; 
    memcpy(&buf[offset], p.effects[i].dropdowns, MAX_EFFECT_DROPDOWNS);
    offset += MAX_EFFECT_DROPDOWNS;
  }

  // 3. EQ Data
  buf[offset++] = 0xFE; // Tag
  buf[offset++] = 12;   // Count

  for (int i = 0; i < 12; i++) {
    buf[offset++] = (uint8_t)(p.eqPoints[i].freq & 0xFF);
    buf[offset++] = (uint8_t)(p.eqPoints[i].freq >> 8);
    buf[offset++] = (uint8_t)p.eqPoints[i].gain;
    buf[offset++] = p.eqPoints[i].q;
    buf[offset++] = p.eqPoints[i].enabled ? 1 : 0;
  }

  return offset;
}

// Parse Protocol v3/v4 Blob -> Internal Struct
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

  // Initialize EQ Defaults (Safe Fallback)
  for (int i = 0; i < 12; i++) {
    p.eqPoints[i].freq = (i == 0) ? 80 : (i == 11) ? 8000
                                                   : (100 * (i + 1));
    p.eqPoints[i].gain = 0;
    p.eqPoints[i].q = 14;
    p.eqPoints[i].enabled = true;
  }

  // 2. Parse Blocks
  while (offset < len) {
    if (offset >= len) break;
    uint8_t id = buf[offset++];

    // --- EQ Tag ---
    if (id == 0xFE) {
      if (offset >= len) break;
      uint8_t count = buf[offset++];

      for (int i = 0; i < count && i < 12; i++) {
        // We need 5 bytes to read an EQ point safely
        if (offset + 5 > len) break;

        uint16_t freq = buf[offset] | (buf[offset + 1] << 8);
        int8_t gain = (int8_t)buf[offset + 2];
        uint8_t q = buf[offset + 3];
        uint8_t enabled = buf[offset + 4];

        p.eqPoints[i].freq = freq;
        p.eqPoints[i].gain = gain;
        p.eqPoints[i].q = q;
        p.eqPoints[i].enabled = (enabled != 0);

        offset += 5;  // Increment by 5
      }
      continue;
    }

    // Standard Effects
    if (offset + 2 > len) break;
    uint8_t enabled = buf[offset++];
    uint8_t kCount = buf[offset++];

   if (id < MAX_EFFECTS) {
      p.effects[id].enabled = (enabled != 0);
      
      // Parse Knobs
      for (int k = 0; k < kCount; k++) {
        if (offset < len) {
          uint8_t val = buf[offset++];
          // [FIX] Use Macro
          if (k < MAX_EFFECT_KNOBS) p.effects[id].knobs[k] = val;
        }
      }
      
      // Parse Dropdowns
      if (offset < len) {
        uint8_t dCount = buf[offset++];
        for (int d = 0; d < dCount; d++) {
          if (offset < len) {
            uint8_t val = buf[offset++];
            // [FIX] Use Macro (Was hardcoded to 4, now 5)
            if (d < MAX_EFFECT_DROPDOWNS) p.effects[id].dropdowns[d] = val;
          }
        }
      }
    
    } else {
      // Unknown ID - skip over it
      offset += kCount;  // Skip knobs
      if (offset < len) {
        uint8_t dCount = buf[offset++];
        offset += dCount;  // Skip dropdowns
      }
    }
  }
}


// ===================================================================
// ROBUST DSP COMMUNICATION BRIDGE (FIXED)
// ===================================================================

enum DSPState {
  DSP_FIND_SYNC,
  DSP_GET_LEN,
  DSP_GET_PAYLOAD
};

DSPState dspState = DSP_FIND_SYNC;
uint32_t dspTargetLen = 0;
uint32_t dspByteCount = 0;

// Static buffer to avoid malloc fragmentation
#define MAX_DSP_BUFFER 4096
uint8_t dspRxBuffer[MAX_DSP_BUFFER];

void checkDSPIncoming() {
  while (dspSerial.available()) {
    uint8_t b = dspSerial.read();

    switch (dspState) {
      // 1. Wait for SYNC Byte (0xAA)
      case DSP_FIND_SYNC:
        if (b == 0xAA) {
          dspState = DSP_GET_LEN;
        }
        break;

      // 2. Read Length (1 Byte)
      // Note: DSP sends (4 + PayloadLen) as the total length
      case DSP_GET_LEN:
        dspTargetLen = b;
        
        // Sanity Check: Minimum 4 bytes (Header) required
        if (dspTargetLen < 4 || dspTargetLen > 255) { 
           dspState = DSP_FIND_SYNC; // Invalid, reset
        } else {
           dspState = DSP_GET_PAYLOAD;
           dspByteCount = 0;
        }
        break;

      // 3. Read Header + Payload
      case DSP_GET_PAYLOAD:
        dspRxBuffer[dspByteCount++] = b;

        if (dspByteCount >= dspTargetLen) {
          // Packet Complete!
          
          // 1. Extract Header (First 4 bytes)
          char header[5];
          memcpy(header, dspRxBuffer, 4);
          header[4] = 0; // Null terminate for safety

          // 2. Extract Payload (Remaining bytes)
          uint8_t* payload = &dspRxBuffer[4];
          uint32_t payloadLen = dspTargetLen - 4;

          // 3. Process
          processDSPPacket(header, payload, payloadLen);

          // 4. Reset
          dspState = DSP_FIND_SYNC;
        }
        break;
    }
  }
}

void processDSPPacket(const char* header, uint8_t* data, uint32_t len) {

  Serial.println(header);
  // 1. TUNER BRIDGE
  if (strncmp(header, "TUNE", 4) == 0 && len == 4) {
    float freq;
    memcpy(&freq, data, 4);
    Serial.println(freq);
    // Bridge to BLE (Priority)
    uint8_t packet[7];
    packet[0] = 0x35;  // TUNER_DATA ID
    packet[1] = 4;     // Len L
    packet[2] = 0;     // Len H
    memcpy(&packet[3], data, 4);
    btManager.sendBLEData(packet, 7);
    //Serial.printf("[DSP] TunerFreq: %3.3f\n", freq);
    // Parse Local
    if (display.isTunerActive()) {
      display.updateTuner(freq);
    }
  }
  // 2. LOAD MONITOR
  else if (strncmp(header, "LOAD", 4) == 0 && len == 4) {
    float load;
    memcpy(&load, data, 4);
    // Optional: Send to BLE debug char if you have one
    //Serial.printf("[DSP] Load: %.1f%%\n", load * 100.0f);
  }
  // [NEW] NAM List Packet
  // Header: "NAML"
  // Payload from DSP: [Index (1b)] [Name String (Nb)...]
  else if (strncmp(header, "NAML", 4) == 0) {
    // Create BLE Packet
    // CMD ID: 0x45 (NAM_LIST_DATA)
    uint8_t packet[len + 2];
    packet[0] = 0x45;               // New Protocol ID for List Item
    memcpy(&packet[1], data, len);  // Copy Payload

    // Forward to WebApp
    btManager.sendBLEData(packet, len + 1);

    // Optional: Store in internal ESP array if you want to show it on the LCD later
    /*
      uint8_t idx = data[0];
      if (idx < 255) {
         char name[32] = {0};
         memcpy(name, &data[1], len-1);
         // strncpy(display.namList[idx], name, 32); 
      }
      */
  } else if (strncmp(header, "IRFL", 4) == 0) {
    // Create BLE Packet
    // CMD ID: 0x46 (NAM_LIST_DATA)
    uint8_t packet[len + 2];
    packet[0] = 0x46;               // New Protocol ID for List Item
    memcpy(&packet[1], data, len);  // Copy Payload

    // Forward to WebApp
    btManager.sendBLEData(packet, len + 1);

    // Optional: Store in internal ESP array if you want to show it on the LCD later
    /*
      uint8_t idx = data[0];
      if (idx < 255) {
         char name[32] = {0};
         memcpy(name, &data[1], len-1);
         // strncpy(display.namList[idx], name, 32); 
      }
      */
  }

  else {
    Serial.printf("[DSP] Unknown Packet: %.4s (%d bytes)\n", header, len);
  }
}

// ===================================================================
// BLE Handler
// ===================================================================
// ===================================================================
// BLE Handler (Fixed for 1-byte commands)
// ===================================================================
void onBLEDataReceived(uint8_t* data, size_t len) {

  // 1. Debug Log
  Serial.printf("[BLE-DEBUG] Data received! Len: %d, Cmd: 0x%02X\n", len, data[0]);

  // 2. Safety Check (Must have at least a Command ID)
  if (len < 1) return;

  uint8_t cmd = data[0];

  // 3. Payload Extraction (Only if len >= 3)
  // We don't return yet, because some commands (0x60, 0x61) don't have payloads.
  uint16_t payloadLen = 0;
  uint8_t* payload = nullptr;

  if (len >= 3) {
    payloadLen = data[1] | (data[2] << 8);
    // Safety: Ensure advertised payload length matches actual buffer
    if (len >= payloadLen + 3) {
      payload = &data[3];
    }
  }

  // 4. Command Router
  switch (cmd) {
    // --- LIVE CONTROLS ---
   // --- LIVE CONTROLS ---
    // --- LIVE CONTROLS ---
    case 0x20:  // Param
      {
        if (!payload) break;
        uint8_t fx = payload[0];
        uint8_t pid = payload[1];
        uint8_t val = payload[2];

        // [FIX 1] Allow access to Effect 17 (Generic)
        if (fx < MAX_EFFECTS) { 
          
          uint8_t actualKnobs = FX_LAYOUT[fx][0];
          
          // [FIX 2] REMOVED "&& pid < 10" check.
          // This allows params 10, 11, etc. (used by FIR) to be processed.
          if (pid >= actualKnobs) {
             uint8_t dropdownIdx = pid - actualKnobs;
             
             // Remap to internal storage index (10+)
             pid = 10 + dropdownIdx;
             
             Serial.printf("[BLE] Remapped FX %d PID %d -> %d (Drop %d)\n", fx, payload[1], pid, dropdownIdx);
          }

          // Store in Struct
          if (pid < 10) {
             currentPreset.effects[fx].knobs[pid] = val;
          } else {
             // Map 10->0, 11->1...
             // Safety check for array bounds
             uint8_t dIdx = pid - 10;
             if(dIdx < MAX_EFFECT_DROPDOWNS) {
                currentPreset.effects[fx].dropdowns[dIdx] = val;
             }
          }
          
          sendEffectChangeToDSP(fx, currentPreset.effects[fx].enabled,
                                currentPreset.effects[fx].knobs, currentPreset.effects[fx].dropdowns);
        }
        break;
      }
    case 0x21:  // Toggle
      {
        if (!payload) break;
        uint8_t fx = payload[0];
        uint8_t en = payload[1];
        if (fx < MAX_EFFECTS) {
          currentPreset.effects[fx].enabled = (en != 0);
          sendEffectChangeToDSP(fx, en, currentPreset.effects[fx].knobs, currentPreset.effects[fx].dropdowns);
        }
        break;
      }
    case 0x22:  // SET_EQ_BAND
      {
        if (!payload) break;
        uint8_t bandIdx = payload[0];
        uint8_t enabled = payload[1];
        uint16_t freq = payload[2] | (payload[3] << 8);
        int8_t gain = (int8_t)payload[4];
        uint8_t q = payload[5];

        if (bandIdx < 12) {
          currentPreset.eqPoints[bandIdx].freq = freq;
          currentPreset.eqPoints[bandIdx].gain = gain;
          currentPreset.eqPoints[bandIdx].q = q;
          currentPreset.eqPoints[bandIdx].enabled = (enabled != 0);
        }
        delay(10);
        sendEQBandToDSP(bandIdx, enabled, freq, gain, q);
        break;
      }
    case 0x23:  // Util
      {
        if (!payload) break;
        uint8_t t = payload[0];
        uint8_t en = payload[1];
        uint8_t lv = payload[2];
        uint16_t f = payload[3] | (payload[4] << 8);
        uint8_t p[5] = { t, en, lv, (uint8_t)(f >> 8), (uint8_t)(f & 0xFF) };
        delay(10);
        sendToDSP("UTIL", p, 5);

        if (t == 2) {
          display.toggleTuner(en > 0);
        }
        break;
      }
    case 0x25:  // Global
      {
        if (!payload || payloadLen < 4) break;
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
        dspPayload[0] = master;
        dspPayload[1] = btVol;
        dspPayload[2] = bpm;
        dspPayload[3] = flags;
        btManager.setA2DPvolume(btVol);
        delay(10);
        sendToDSP("GEN ", dspPayload, 4);
        break;
      }
    case 0x30:  // Handshake
      {
        size_t size = serializeStructToBlob(currentPreset, blobBuffer);
        uint8_t head[3] = { 0x31, (uint8_t)(size & 0xFF), (uint8_t)(size >> 8) };
        btManager.sendBLEData(head, 3);
        btManager.sendBLEDataChunked(blobBuffer, size);
        Serial.println("[BLE] Sent Handshake State");
        break;
      }
    case 0x32:  // SAVE_PRESET
      {
        if (!payload) break;
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
    case 0x33:  // LOAD_REQ
      {
        if (!payload) break;
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
    // --- DRUM PATTERN EDIT (0x40) ---
    // Payload: [RowIndex, V0, V1, ... V15] (17 bytes)
    case 0x40:
      {
        if (payloadLen < 17) break;
        uint8_t row = payload[0];
        uint8_t* vels = &payload[1];

        // Use the new helper to split and send via robust protocol
        sendDrumPatternToDSP(row, vels);
        break;
      }

    // --- DRUM SETTINGS UPDATE (0x41) ---
    // Fixes the raw write issue
    case 0x41:
      {
        // App sends: [Header(4), En, Lvl, BPM, LoopEn, LoopLvl... Fill, Style, LoopNum, Sync]
        // We verify header but strip it for the Robust Payload
        if (payloadLen < 14) break;
        if (payload[0] != 0x44) break;  // Check 'D' of DRUM

        // Mapping App Payload -> Daisy "DRUM" Handler indices
        // App Payload Index:
        // 4: En, 5: Lvl, 6: BPM, 8: ReverbLvl, 13: LoopNum, 14: Style

        uint8_t dspP[16] = { 0 };  // Clear buffer

        dspP[0] = payload[4];  // Enable  -> Daisy data[4]
        dspP[1] = payload[5];  // Level   -> Daisy data[5]
        dspP[2] = payload[6];  // BPM     -> Daisy data[6]
        dspP[3] = 0;           // Spare   -> Daisy data[7]
        dspP[4] = payload[8];  // Rev Lvl -> Daisy data[8] (Looper lvl in app, Reverb in Daisy?)

        // Indices 9-12 Spares

        dspP[9] = payload[15];   // LoopNum -> Daisy data[13]
        dspP[10] = payload[14];  // Style   -> Daisy data[14]

        // Send via Robust Protocol
        sendDataRobust("DRUM", dspP, 11);
        break;
      }

    // =================================================================
    // SYSTEM COMMANDS (Safe Version)
    // =================================================================
    case 0x60:  // CMD: FLASH_DSP
      {
        Serial.println("[BLE] Processing FLASH command...");

        // 1. Create explicit buffer for header (Safe memory)
        char header[] = "FLSH";

        // 2. Create dummy payload so we never pass nullptr
        uint8_t dummy = 0;

        // 3. Call with valid pointers
        sendToDSP(header, &dummy, 0);
        break;
      }

    case 0x61:  // CMD: RESET_DSP
      {
        Serial.println("[BLE] Processing RESET command...");

        // 1. Create explicit buffer
        char header[] = "RSTD";

        // 2. Dummy payload
        uint8_t dummy = 0;

        // 3. Call with valid pointers
        sendToDSP(header, &dummy, 0);
        break;
      }
    // NEW COMMAND: START MIDI SCAN
    case 0x62:
      {
        Serial.println("[BLE] Received MIDI Scan Request.");
        btManager.startMidiScan();  // <--- Wakes up the background task
        break;
      }
  }
}

// ===================================================================
// DSP Helpers
// ===================================================================
// ===================================================================
// HELPER: Send Drum Pattern (Splits into 2 Robust Packets)
// ===================================================================
void sendDrumPatternToDSP(uint8_t rowIdx, uint8_t* velocities) {
    // Daisy expects "DRM1" for steps 0-9 (10 bytes) + Row Index
    // Daisy expects "DRM2" for steps 10-15 (6 bytes) + Row Index
    
    // --- Chunk 1: DRM1 ---
    uint8_t p1[11];
    p1[0] = rowIdx;                  // Byte 0: Row Index
    memcpy(&p1[1], &velocities[0], 10); // Bytes 1-10: Velocities 0-9
    sendDataRobust("DRM1", p1, 11);
    
    delay(5); // Small safety gap for DMA
    
    // --- Chunk 2: DRM2 ---
    uint8_t p2[7];
    p2[0] = rowIdx;                  // Byte 0: Row Index
    memcpy(&p2[1], &velocities[10], 6); // Bytes 1-6: Velocities 10-15
    sendDataRobust("DRM2", p2, 7);
}


/*
void sendEffectChangeToDSP(uint8_t idx, uint8_t en, const uint8_t* k, const uint8_t* d) {
  const char* name;
  if (idx < MAX_EFFECTS) name = EFFECT_NAMES[idx];
  else name = "GEN ";

  uint8_t buf[17] = { 0 };

  // 1. Header & Enable
  memcpy(buf, name, 4);
  buf[4] = en ? 1 : 0;

  // 2. Determine Valid Data Counts
  uint8_t kCount = (idx < 17) ? FX_LAYOUT[idx][0] : 10;
  uint8_t dCount = (idx < 17) ? FX_LAYOUT[idx][1] : 2;

  // 3. Pack Payload (Max 12 Bytes)
  int offset = 5;

  // Write ONLY the valid knobs (skipping unused ones)
  if (k) {
    for (int i = 0; i < kCount && offset < 17; i++) {
      buf[offset++] = k[i];
    }
  }

  // Write Dropdowns immediately after valid knobs
  if (d) {
    for (int i = 0; i < dCount && offset < 17; i++) {
      buf[offset++] = d[i];
    }
  }

  // 4. Send
  dspSerial.write(buf, 17);

  // Debug to Serial Monitor to verify

  Serial.print("[DSP] Sent: ");
  Serial.print(name);
  for (int i = 0; i < 17; i++) {
    Serial.printf(" %02X", buf[i]);
  }
  Serial.println();
}

void sendToDSP(const char cmd[4], uint8_t* payload, size_t len) {
  uint8_t buf[17] = { 0 };
  memcpy(buf, cmd, 4);
  // Byte 4 is usually Enable/Flag, payload starts at 5 in standard packets
  // But for raw commands, we just copy payload to 4
  // Note: Standard FX packets handle byte 4 manually in the function below.
  // This helper is for GENERIC cmds like "UTIL".
  if (payload && len > 0) {
    memcpy(buf + 4, payload, min(len, (size_t)13));
  }
  //if (len == 0) {
  //  memcpy(buf + 4, 0, 13);
  //}
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
  uint8_t p[13] = { currentPreset.bank, currentPreset.number, 255 , currentPreset.bpm };
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
                    currentPreset.eqPoints[i].q);
    delay(10);  // Short delay to prevent buffer overflow
  }
}*/

// ===================================================================
// NEW: Helper for Robust Protocol (Sync + Length + Header + Data)
// ===================================================================
void sendDataRobust(const char* header, const uint8_t* payload, size_t len) {
  uint8_t sync = 0xAA;
  uint8_t totalLen = 4 + len; 

  if (totalLen > 255) return; 

  // 1. Send Sync
  dspSerial.write(sync);      
  dspSerial.flush();    // Force byte out to wire
  delay(2);             // Wait 2ms for Daisy ISR to wake up and switch state

  // 2. Send Length
  dspSerial.write(totalLen);  
  dspSerial.flush();    // Force byte out to wire
  delay(2);             // Wait 2ms for Daisy to allocate buffer

  // 3. Send Header + Data (These can be burst sent)
  dspSerial.write(header, 4); 
  if (len > 0 && payload != NULL) {
    dspSerial.write(payload, len); 
  }
  // dspSerial.flush(); // Optional: wait for packet to finish
}

// ===================================================================
// UPDATED: Effect Sender
// ===================================================================
/*void sendEffectChangeToDSP(uint8_t idx, uint8_t en, const uint8_t* k, const uint8_t* d) {
  const char* name;
  if (idx < MAX_EFFECTS) name = EFFECT_NAMES[idx];
  else name = "GEN ";

  // Buffer: Enable(1) + Knobs(10) + Drops(4) = 15 bytes max payload
  uint8_t payload[20];
  int offset = 0;

  // 1. Enable Flag
  payload[offset++] = en ? 1 : 0;

  // 2. Determine Valid Data Counts
  uint8_t kCount = (idx < 17) ? FX_LAYOUT[idx][0] : 10;
  uint8_t dCount = (idx < 17) ? FX_LAYOUT[idx][1] : 4; // Allow up to 4 drops

  // 3. Pack Knobs (Limit to 10)
  if (k) {
    for (int i = 0; i < kCount && i < 10; i++) {
      payload[offset++] = k[i];
    }
  }

  // 4. Pack Dropdowns (Limit to 4)
  // [FIX 2] Removed "&& i < 2" limit. Now sends all valid drops.
  if (d) {
    for (int i = 0; i < dCount && i < 4; i++) {
      payload[offset++] = d[i];
    }
  }

  // 5. Send via Robust Protocol
  // The payload length is now dynamic (e.g., NAM = 1+2+1 = 4 bytes)
  sendDataRobust(name, payload, offset);
}*/

// ===================================================================
// UPDATED: Effect Sender (Dynamic Payload - No Padding)
// ===================================================================
void sendEffectChangeToDSP(uint8_t idx, uint8_t en, const uint8_t* k, const uint8_t* d) {
  const char* name;
  if (idx < MAX_EFFECTS) name = EFFECT_NAMES[idx];
  else name = "GEN ";

  uint8_t kCount = (idx < MAX_EFFECTS) ? FX_LAYOUT[idx][0] : 0;
  uint8_t dCount = (idx < MAX_EFFECTS) ? FX_LAYOUT[idx][1] : 0;

  // [FIX] Increase buffer size (20 is safe, strictly needs 16)
  uint8_t payload[32]; 
  int offset = 0;

  payload[offset++] = en ? 1 : 0;

  // Pack ACTIVE Knobs
  if (k) {
    for (int i = 0; i < kCount; i++) {
      payload[offset++] = k[i];
    }
  }

  // Pack ACTIVE Dropdowns
  if (d) {
    for (int i = 0; i < dCount; i++) {
      payload[offset++] = d[i];
    }
  }

  sendDataRobust(name, payload, offset);
}

// ===================================================================
// UPDATED: Generic Sender
// ===================================================================
void sendToDSP(const char cmd[4], uint8_t* payload, size_t len) {
  // Simple wrapper around the robust sender
  sendDataRobust(cmd, payload, len);
}

// ===================================================================
// UPDATED: EQ Sender
// ===================================================================
void sendEQBandToDSP(uint8_t b, uint8_t enabled, uint16_t f, int8_t g, uint8_t q) {
  char h[5];
  if (b == 0) strcpy(h, "EQHP");
  else if (b == 11) strcpy(h, "EQLP");
  else snprintf(h, 5, "EQ%02d", b);

  // Pack the 5 payload bytes
  uint8_t p[5] = { enabled, (uint8_t)(f >> 8), (uint8_t)(f & 0xFF), (uint8_t)g, q };

  // Send
  sendDataRobust(h, p, 5);
}

// ===================================================================
// UPDATED: Full Preset Update
// ===================================================================
void updateDSPFromPreset() {
  uint8_t p[13] = { currentPreset.bank, currentPreset.number, 255 /*currentPreset.masterVolume*/, currentPreset.bpm };
  sendToDSP("PRES", p, 4);  // Note: Payload length is 4 based on array init above

  for (int i = 0; i < MAX_EFFECTS; i++) {
    sendEffectChangeToDSP(i, currentPreset.effects[i].enabled,
                          currentPreset.effects[i].knobs, currentPreset.effects[i].dropdowns);
    // With the robust protocol + DMA, we can reduce delays,
    // but keeping a small one ensures the buffer handles ring processing.
    delay(5);
  }

  // Update EQ Bands
  for (int i = 0; i < 12; i++) {
    sendEQBandToDSP(i,
                    currentPreset.eqPoints[i].enabled ? 1 : 0,
                    currentPreset.eqPoints[i].freq,
                    currentPreset.eqPoints[i].gain,
                    currentPreset.eqPoints[i].q);
    delay(5);
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
      for (int i = 0; i < 12; i++) {
        p.eqPoints[i].freq = (i == 0) ? 80 : (i == 11) ? 8000
                                                       : (100 * (i + 1));
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

// -----------------------------------------------------------
// Load Preset - Master Volume Protection
// -----------------------------------------------------------
bool loadPreset(uint8_t bank, uint8_t number, Preset& preset) {
  if (bank > 6 || number > 4) return false;

  char filename[64];
  if (bank < 5) snprintf(filename, sizeof(filename), "/presets/f_%d_%d.bin", bank, number);
  else snprintf(filename, sizeof(filename), "/presets/c_%d_%d.bin", bank - 5, number);

  if (LittleFS.exists(filename)) {
    File file = LittleFS.open(filename, "r");
    if (file) {
      // Load into TEMP to protect Master Volume
      Preset temp;
      size_t size = file.read(blobBuffer, MAX_BLOB_SIZE);
      file.close();

      parseBlobToStruct(blobBuffer, size, temp);

      // 1. Save current Master Volume
      uint8_t currentVol = preset.masterVolume;

      // 2. Overwrite everything
      preset = temp;

      // 3. Restore Master Volume
      preset.masterVolume = currentVol;

      // 4. Ensure IDs correct
      preset.bank = bank;
      preset.number = number;
      return true;
    }
  }

  // 2. File missing? Load "Default/Empty" state instead of failing
  // This allows navigation to proceed to empty banks (Custom 1 & 2)
  Serial.printf("[PRESET] File %s not found. Loading default.\n", filename);

  memset(&preset, 0, sizeof(Preset));

  // Set default name based on Bank
  const char* defaultNames[] = { "Clean", "Crunch", "Overdrive", "Distortion", "Modulated", "Custom1", "Custom2" };
  snprintf(preset.name, 32, "%s %d", defaultNames[bank], number + 1);

  preset.bank = bank;
  preset.number = number;
  preset.masterVolume = 100;
  preset.bpm = 120;

  // Default EQ
  for (int i = 0; i < 12; i++) {
    preset.eqPoints[i].freq = (i == 0) ? 80 : (i == 11) ? 8000
                                                        : (100 * (i + 1));
    preset.eqPoints[i].gain = 0;
    preset.eqPoints[i].q = 14;
    preset.eqPoints[i].enabled = true;
  }

  return true;  // Return TRUE so the system allows the switch
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
  //const int switchPins[4] = { SWITCH1_PIN, SWITCH2_PIN, SWITCH3_PIN, SWITCH4_PIN };
  //for (int i = 0; i < 4; i++) pinMode(switchPins[i], INPUT_PULLUP);
  switch1.begin();
  switch2.begin();
}

void sendSwitchStateToDSP(int switchIndex, bool switchState) {
  uint8_t payload[13] = { 0 };
  payload[0] = switchIndex;
  payload[1] = switchState;
  sendToDSP("SWCH", payload, 2);
}

void handleSwitches() {
  switch1.update();
  switch2.update();
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

// Callback to forward MIDI data from pedal to DSP
void processMidiFromPedal(uint8_t* data, size_t len) {
  uint8_t payload[5] = { 0 };
  payload[0] = 1;  // Enable flag

  // Copy up to 4 bytes
  size_t bytesToCopy = (len > 4) ? 4 : len;
  memcpy(&payload[1], data, bytesToCopy);

  // Send "MIDI" command to DSP
  sendToDSP("MIDI", payload, 5);
}

/*void playBootAnimation() {
  char filename[32];
  
  for (int i = 1; i <= FRAME_COUNT; i++) {
    // Format the filename string (e.g., "/frame_001.jpg")
    // Adjust the format "%03d" if your numbering is different (e.g. 1 vs 001)
    sprintf(filename, "/frame_%03d.jpg", i); 

    if (LittleFS.exists(filename)) {
      // Draw the image at 0,0
      TJpgDec.drawFsJpg(0, 0, filename, LittleFS);
      delay(FPS_DELAY); 
    } else {
      Serial.printf("File not found: %s\n", filename);
    }
  }
}*/

// Define a buffer size slightly larger than your biggest JPG file.
// 20KB (20480) is usually safe for 240x240 frames.
#define MAX_JPG_SIZE 24000

void playBootAnimation() {
  char filename[32];

  // 1. Allocate a reuseable buffer in RAM (Heaps faster than Flash reading)
  uint8_t* pBuffer = (uint8_t*)malloc(MAX_JPG_SIZE);

  // Safety check: if we ran out of RAM, fallback or exit
  if (!pBuffer) {
    Serial.println("Not enough RAM for animation buffer!");
    return;
  }

  for (int i = 1; i <= FRAME_COUNT; i++) {
    sprintf(filename, "/frame_%03d.jpg", i);

    // 2. Open file directly. Don't use .exists() (it wastes time double-checking)
    File jpgFile = LittleFS.open(filename, "r");

    if (jpgFile) {
      size_t fileSize = jpgFile.size();

      // Check if the frame fits in our RAM buffer
      if (fileSize < MAX_JPG_SIZE) {

        // 3. READ: Slurp the whole file into RAM in one go
        jpgFile.read(pBuffer, fileSize);

        // 4. DECODE: Decode from fast RAM instead of slow Flash
        TJpgDec.drawJpg(0, 0, pBuffer, fileSize);
      }

      jpgFile.close();  // Close file handle immediately
    }

    // 5. REMOVE delay entirely. The decoding time is usually delay enough.
    // delay(FPS_DELAY);
  }

  // 6. Free the RAM buffer so your main program can use it
  free(pBuffer);
}

/*void setup() {
  Serial.begin(115200);
  if (!LittleFS.begin(true)) {
    Serial.println("[FS] Mount Failed, formatting...");
  }
  listDir(LittleFS, "/", 0);  // <--- Add this line

  initializeFactoryPresets();
  loadSystemState();

  encoder1.begin();
  encoder2.begin();
  setupSwitches();
  
  //display.begin();
  dspSerial.begin(115200, SERIAL_8N1, DSP_RX_PIN, DSP_TX_PIN);

  display.tft.init();
  display.tft.setRotation(2);
  display.tft.fillScreen(TFT_BLACK);
  TJpgDec.setJpgScale(1);
  TJpgDec.setSwapBytes(true);
  TJpgDec.setCallback(tft_output);

  // 4. Run Boot Animation
  playBootAnimation();
  delay(2000);
  display.begin();

  i2s_pin_config_t pins = { .mck_io_num = 0, .bck_io_num = 14, .ws_io_num = 13, .data_out_num = 12, .data_in_num = 35 };
  btManager.setA2DPPinConfig(pins);

  // 1. Initialize Bluetooth (Starts advertising AND background MIDI task)
  btManager.begin("JamMate", state.a2dpEnabled);

  // 2. Register Callbacks
  btManager.setBLEDataCallback(onBLEDataReceived);
  btManager.setMidiCallback(processMidiFromPedal);  // <--- IMPORTANT: Link the callback

  btManager.setCurrentPreset(&currentPreset);

  Serial.println("[JamMate] v3.3 Ready");
  updateDSPFromPreset();
  lastSaveTime = millis();
}*/

void setup() {
  Serial.begin(115200);
  delay(2000);
  // 1. Init Filesystem
  if (!LittleFS.begin(true)) {
    Serial.println("[FS] Mount Failed, formatting...");
  }

  // 2. Load State & Hardware Init
  initializeFactoryPresets();
  loadSystemState();

  encoder1.begin();
  encoder2.begin();
  setupSwitches();

  dspSerial.begin(115200, SERIAL_8N1, DSP_RX_PIN, DSP_TX_PIN);

  // 3. Init Display & Decoder
  display.tft.init();
  display.tft.setRotation(2);
  display.tft.fillScreen(TFT_BLACK);
  TJpgDec.setJpgScale(1);
  TJpgDec.setSwapBytes(true);
  TJpgDec.setCallback(tft_output);

  // 4. CRITICAL FIX: Init Bluetooth FIRST (Before Animation)
  // This ensures A2DP gets the clean continuous RAM it needs before we fragment heap with images.
  i2s_pin_config_t pins = { .mck_io_num = 0, .bck_io_num = 14, .ws_io_num = 13, .data_out_num = 12, .data_in_num = 35 };
  btManager.setA2DPPinConfig(pins);
  btManager.begin("JamMate", state.a2dpEnabled);
  btManager.setBLEDataCallback(onBLEDataReceived);
  btManager.setMidiCallback(processMidiFromPedal);
  btManager.setCurrentPreset(&currentPreset);

  // 5. Run Boot Animation (Now safe to run while BT advertises in background)
  playBootAnimation();
  delay(2000);
  // 6. REMOVE BLOCKING DELAY
  // delay(2000);  <-- Delete this line. It makes the GUI unresponsive for no reason.




  Serial.println("[JamMate] v3.3 Ready");

  // 8. Sync DSP
  updateDSPFromPreset();
  // 7. Draw Main Interface
  // We do this LAST so the user never sees a UI until the loop is about to start.
  display.begin();
  lastSaveTime = millis();
}

void loop() {
  encoder1.update();
  encoder2.update();
  //handleEncoders();
  handleSwitches();
  checkDSPIncoming();
  display.loop();
  //btManager.update();

  if (millis() - lastSaveTime > SAVE_INTERVAL) {
    saveSystemState();
    lastSaveTime = millis();
  }
  delay(1);
}

void listDir(fs::FS& fs, const char* dirname, uint8_t levels) {
  Serial.printf("Listing directory: %s\r\n", dirname);

  File root = fs.open(dirname);
  if (!root) {
    Serial.println("- failed to open directory");
    return;
  }
  if (!root.isDirectory()) {
    Serial.println(" - not a directory");
    return;
  }

  File file = root.openNextFile();
  while (file) {
    if (file.isDirectory()) {
      Serial.print("  DIR : ");
      Serial.println(file.name());
    } else {
      Serial.print("  FILE: ");
      Serial.print(file.name());
      Serial.print("\tSIZE: ");
      Serial.println(file.size());
    }
    file = root.openNextFile();
  }
}