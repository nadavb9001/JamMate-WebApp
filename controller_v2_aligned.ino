// ===================================================================
// JamMate Multi-Effect Controller - Firmware v3.0
// Protocol: Command-Based (v3) over BLE
// Storage: SPIFFS (Legacy Struct v2)
// ===================================================================

#include "PresetBinary_v2.hpp"
#include "BluetoothManager_binary.hpp"
#include "MyRotaryEncoder.h"
#include <SPIFFS.h>

// ===================================================================
// Pin Definitions
// ===================================================================
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

// ===================================================================
// Configuration Constants
// ===================================================================
#define SAVE_INTERVAL 5000  // Auto-save every 5 seconds

// ===================================================================
// Global Objects
// ===================================================================
BluetoothManager btManager;
RotaryEncoder encoder1(ENCODER1_PIN_A, ENCODER1_PIN_B, ENCODER1_BTN);
RotaryEncoder encoder2(ENCODER2_PIN_A, ENCODER2_PIN_B, ENCODER2_BTN);
HardwareSerial dspSerial(2);

// ===================================================================
// State Variables
// ===================================================================
struct SystemState {
  uint8_t currentBank;
  uint8_t currentPresetNum;
  uint8_t volume;
  bool a2dpEnabled;
  bool switchStates[4];
} state;

// Current active preset
Preset currentPreset;

// 17-byte legacy DSP protocol buffer
uint8_t txBuffer[17] = { 0 };
// BLE binary transmission buffer
uint8_t bleTxBuffer[sizeof(PresetBinary)] = { 0 };

// Encoder state tracking
int lastEncoder1Pos = 0;
int lastEncoder2Pos = 0;
unsigned long lastEncoder1BtnTime = 0;
unsigned long lastEncoder2BtnTime = 0;
const unsigned long DEBOUNCE_TIME = 200;
unsigned long lastSaveTime = 0;

// ===================================================================
// Debug Macros
// ===================================================================
#define LOG_PRESET_LOAD(p) Serial.printf("[PRESET-LOAD] %s (Bank %d, Num %d, Ver %d)\n", \
  (p).name, (p).bank, (p).number, PRESET_PROTOCOL_VERSION)
#define LOG_PRESET_SAVE(p) Serial.printf("[PRESET-SAVE] %s (Bank %d, Num %d)\n", \
  (p).name, (p).bank, (p).number)

// ===================================================================
// DSP Communication Wrappers
// ===================================================================
void sendToDSP(const char cmd[4], uint8_t* payload, size_t payloadLen) {
  memset(txBuffer, 0, 17);
  txBuffer[0] = cmd[0];
  txBuffer[1] = cmd[1];
  txBuffer[2] = cmd[2];
  txBuffer[3] = cmd[3];
  if (payload && payloadLen > 0) {
    // Safety copy to prevent overflow
    memcpy(txBuffer + 4, payload, min(payloadLen, (size_t)13));
  }
  dspSerial.write(txBuffer, 17);
}

// ===================================================================
// Send Single Effect Change to DSP (Legacy 17-Byte Protocol)
// ===================================================================
void sendEffectChangeToDSP(uint8_t effectIdx, uint8_t enabled,
                           const uint8_t* knobs, const uint8_t* dropdowns) {
  
  if (effectIdx >= MAX_EFFECTS) return;

  // 1. Get the Legacy Header (4 chars) from the definition file
  // e.g., "Gate", "Comp", "FIR "
  const char* shortName = EFFECT_NAMES[effectIdx]; 

  // 2. Prepare Fixed 17-Byte Buffer
  uint8_t buffer[17];
  memset(buffer, 0, 17); // Fill with zeros (padding)

  // [0-3] Header
  memcpy(buffer, shortName, 4);

  // [4] Enabled
  buffer[4] = enabled ? 1 : 0;

  // 3. Special Mapping: Amp/Cab (FIR )
  // The FIR effect has fewer knobs, so we pack dropdowns earlier to fit 4 of them.
  if (strncmp(shortName, "FIR ", 4) == 0) {
    // [5-11] Knobs 0-6 (7 Knobs)
    if (knobs) memcpy(&buffer[5], knobs, 7);

    // [12-15] Dropdowns 0-3 (Packed into "Knob" slots 7-9 + Drop 0)
    if (dropdowns) {
      buffer[12] = dropdowns[0]; // Amp Type
      buffer[13] = dropdowns[1]; // Tone Type
      buffer[14] = dropdowns[2]; // IR Points
      buffer[15] = dropdowns[3]; // IR Type
    }
  } 
  // 4. Standard Mapping: All other effects
  else {
    // [5-14] Knobs 0-9 (10 Knobs)
    if (knobs) memcpy(&buffer[5], knobs, 10);

    // [15-16] Dropdowns 0-1 (Standard 2 Dropdowns)
    if (dropdowns) {
      buffer[15] = dropdowns[0];
      buffer[16] = dropdowns[1];
    }
  }

  // 5. Send to DSP
  dspSerial.write(buffer, 17);
  
  // Debug Output
  Serial.printf("[DSP-TX] Legacy: %s En:%d K0:%d K1:%d ...\n", 
    shortName, buffer[4], buffer[5], buffer[6]);
}

// ===================================================================
// Helper: Send EQ Band to DSP (Protocol v3 Implementation)
// ===================================================================
void sendEQBandToDSP(uint8_t bandIdx, uint16_t freq, int8_t gain, uint8_t q) {
  // Header construction: "EQ01", "EQHP", etc.
  char header[5];
  if (bandIdx == 0) snprintf(header, 5, "EQHP");       // Band 0 = HPF
  else if (bandIdx == 11) snprintf(header, 5, "EQLP"); // Band 11 = LPF
  else snprintf(header, 5, "EQ%02d", bandIdx);         // Bands 1-10
  
  uint8_t payload[5];
  payload[0] = 1; // Enable (Always 1 for live updates)
  
  // Freq (Big Endian for DSP)
  payload[1] = (freq >> 8) & 0xFF;
  payload[2] = freq & 0xFF;
  
  payload[3] = (uint8_t)gain; // Cast int8 to uint8 (2's complement)
  payload[4] = q;
  
  // Send 4-byte header + 5-byte payload
  sendToDSP(header, payload, 5); 
  
  Serial.printf("[DSP-TX] %s F:%d G:%d Q:%d\n", header, freq, gain, q);
}

// ===================================================================
// BLE Data Handler - Protocol v3 (Command + Length + Payload)
// ===================================================================
void onBLEDataReceived(uint8_t* data, size_t len) {
  // 1. Validate Header Size (Cmd + Len_L + Len_H = 3 bytes)
  if (len < 3) return;

  uint8_t cmd = data[0];
  uint16_t payloadLen = data[1] | (data[2] << 8); // Little Endian Length

  // 2. Validate Payload Integrity
  if (len < payloadLen + 3) {
    Serial.printf("[BLE] ✗ Fragmented packet? Expected %d, Got %d\n", payloadLen + 3, len);
    return;
  }

  uint8_t* payload = &data[3];

  switch (cmd) {
    
    // ============================================================
    // 0x20: SET_PARAM (Knob or Dropdown)
    // Payload: [FxID, ParamID, Value]
    // ============================================================
    case 0x20: { 
      uint8_t fxId = payload[0];
      uint8_t paramId = payload[1];
      uint8_t value = payload[2];

      if (fxId >= MAX_EFFECTS) break;

      // Update Internal State
      if (paramId < 10) {
        // It's a Knob (0-9)
        currentPreset.effects[fxId].knobs[paramId] = value;
        Serial.printf("[BLE] Set Knob: Fx %d, Knob %d -> %d\n", fxId, paramId, value);
      } else {
        // It's a Dropdown (10-13 mapped to 0-3)
        uint8_t dropIdx = paramId - 10;
        if (dropIdx < MAX_EFFECT_DROPDOWNS) {
          currentPreset.effects[fxId].dropdowns[dropIdx] = value;
          Serial.printf("[BLE] Set Drop: Fx %d, Drop %d -> %d\n", fxId, dropIdx, value);
        }
      }

      // Forward FULL effect state to DSP
      sendEffectChangeToDSP(
        fxId, 
        currentPreset.effects[fxId].enabled,
        currentPreset.effects[fxId].knobs,
        currentPreset.effects[fxId].dropdowns
      );
      break;
    }

    // ============================================================
    // 0x21: SET_TOGGLE (Enable/Disable Effect)
    // Payload: [FxID, Enabled]
    // ============================================================
    case 0x21: {
      uint8_t fxId = payload[0];
      uint8_t enabled = payload[1];

      if (fxId >= MAX_EFFECTS) break;

      currentPreset.effects[fxId].enabled = (enabled != 0);
      Serial.printf("[BLE] Toggle Fx %d -> %s\n", fxId, enabled ? "ON" : "OFF");

      // Forward to DSP
      sendEffectChangeToDSP(
        fxId, 
        currentPreset.effects[fxId].enabled,
        currentPreset.effects[fxId].knobs,
        currentPreset.effects[fxId].dropdowns
      );
      break;
    }

    // ============================================================
    // 0x22: SET_EQ_BAND (IIR Update)
    // Payload: [BandIdx(1), Freq(2), Gain(1), Q(1)]
    // ============================================================
    case 0x22: {
      uint8_t bandIdx = payload[0];
      uint16_t freq = payload[1] | (payload[2] << 8); // Little Endian
      int8_t gain = (int8_t)payload[3];
      uint8_t q = payload[4];

      // Forward directly to DSP (Ghost Data)
      sendEQBandToDSP(bandIdx, freq, gain, q);
      break;
    }

    // ============================================================
    // 0x30: GET_STATE (Handshake)
    // Payload: None
    // Response: 0x31 + Len + BinaryStruct
    // ============================================================
    case 0x30: {
      Serial.println("[BLE] Handshake Request (0x30)");
      
      uint8_t responseHead[3];
      responseHead[0] = 0x31; // STATE_DATA
      uint16_t size = sizeof(PresetBinary);
      responseHead[1] = size & 0xFF;
      responseHead[2] = (size >> 8) & 0xFF;

      // Send Header
      btManager.sendBLEData(responseHead, 3);
      
      // Send Body (The PresetBinary struct)
      PresetBinary binary;
      PresetBinaryCodec::convertToBinary(currentPreset, binary);
      btManager.sendBLEData((uint8_t*)&binary, sizeof(PresetBinary));
      
      Serial.println("[BLE] Sent Full State");
      break;
    }
    
    // ============================================================
    // 0xFF: Legacy Wrapper (Backward Compatibility)
    // ============================================================
    case 0xFF:
       if (len >= 20) { 
         // Skip 3 bytes header, forward 17 bytes
         dspSerial.write(&data[3], 17); 
       }
       break;

    default:
      Serial.printf("[BLE] Unknown OpCode: 0x%02X\n", cmd);
      break;
  }
}

// ===================================================================
// SPIFFS & Persistence (Legacy v2 Logic)
// ===================================================================
void initializeFactoryPresets() {
  if (SPIFFS.exists("/presets/factory_v2.flag")) {
    Serial.println("[PRESETS] Factory presets v2 already initialized");
    return;
  }

  Serial.println("[PRESETS] Initializing factory presets...");
  SPIFFS.mkdir("/presets");
  const char* bankNames[] = { "Clean", "Crunch", "Overdrive", "Distortion", "Modulated", "Custom1", "Custom2" };

  // Factory Presets (0-4)
  for (int bank = 0; bank < 5; bank++) {
    for (int num = 0; num < 5; num++) {
      Preset p;
      memset(&p, 0, sizeof(Preset));
      snprintf(p.name, sizeof(p.name), "%s-%d", bankNames[bank], num + 1);
      p.bank = bank; p.number = num; p.masterVolume = 127; p.bpm = 120;
      
      for (int i = 0; i < MAX_EFFECTS; i++) {
        p.effects[i].enabled = (i < 3);
        for (int k = 0; k < MAX_EFFECT_KNOBS; k++) p.effects[i].knobs[k] = 50;
        for (int d = 0; d < MAX_EFFECT_DROPDOWNS; d++) p.effects[i].dropdowns[d] = 0;
      }
      
      char filename[64];
      snprintf(filename, sizeof(filename), "/presets/f_%d_%d.dat", bank, num);
      File file = SPIFFS.open(filename, "w");
      if (file) {
        file.write((uint8_t*)&p, sizeof(Preset));
        file.close();
      }
    }
  }
  
  // Custom Presets (5-6)
  for (int bank = 5; bank < 7; bank++) {
    for (int num = 0; num < 5; num++) {
      Preset p;
      memset(&p, 0, sizeof(Preset));
      snprintf(p.name, sizeof(p.name), "%s-%d", bankNames[bank], num + 1);
      p.bank = bank; p.number = num; p.masterVolume = 127; p.bpm = 120;
      
      for (int i = 0; i < MAX_EFFECTS; i++) {
        p.effects[i].enabled = false;
        for (int k = 0; k < MAX_EFFECT_KNOBS; k++) p.effects[i].knobs[k] = 50;
        for (int d = 0; d < MAX_EFFECT_DROPDOWNS; d++) p.effects[i].dropdowns[d] = 0;
      }
      
      char filename[64];
      snprintf(filename, sizeof(filename), "/presets/c_%d_%d.dat", bank - 5, num);
      File file = SPIFFS.open(filename, "w");
      if (file) {
        file.write((uint8_t*)&p, sizeof(Preset));
        file.close();
      }
    }
  }
  
  File flagFile = SPIFFS.open("/presets/factory_v2.flag", "w");
  if (flagFile) { flagFile.print("v2_initialized"); flagFile.close(); }
  Serial.println("[PRESETS] ✓ Factory initialization complete");
}

bool loadPreset(uint8_t bank, uint8_t number, Preset& preset) {
  if (bank > 6 || number > 4) return false;
  char filename[64];
  if (bank < 5) snprintf(filename, sizeof(filename), "/presets/f_%d_%d.dat", bank, number);
  else snprintf(filename, sizeof(filename), "/presets/c_%d_%d.dat", bank - 5, number);

  File file = SPIFFS.open(filename, "r");
  if (!file) return false;
  size_t bytesRead = file.read((uint8_t*)&preset, sizeof(Preset));
  file.close();
  return (bytesRead == sizeof(Preset) && PresetBinaryCodec::validatePreset(preset));
}

bool savePreset(const Preset& preset) {
  if (preset.bank < 5) return false;
  if (!PresetBinaryCodec::validatePreset(preset)) return false;
  
  char filename[64];
  snprintf(filename, sizeof(filename), "/presets/c_%d_%d.dat", preset.bank - 5, preset.number);
  File file = SPIFFS.open(filename, "w");
  if (!file) return false;
  size_t written = file.write((uint8_t*)&preset, sizeof(Preset));
  file.close();
  return (written == sizeof(Preset));
}

void loadSystemState() {
  File file = SPIFFS.open("/state.dat", "r");
  if (file) {
    if (file.read((uint8_t*)&state, sizeof(SystemState)) == sizeof(SystemState)) {
      Serial.println("[SPIFFS] ✓ System state loaded");
    } else {
      goto use_defaults;
    }
    file.close();
  } else {
    use_defaults:
    state.currentBank = 0; state.currentPresetNum = 0;
    state.volume = 127; state.a2dpEnabled = true;
    for (int i = 0; i < 4; i++) state.switchStates[i] = false;
  }
  
  if (!loadPreset(state.currentBank, state.currentPresetNum, currentPreset)) {
    memset(&currentPreset, 0, sizeof(Preset));
  }
}

void saveSystemState() {
  File file = SPIFFS.open("/state.dat", "w");
  if (file) {
    file.write((uint8_t*)&state, sizeof(SystemState));
    file.close();
  }
}

// ===================================================================
// Standard Helpers
// ===================================================================
void sendPresetChangeToDSP() {
  uint8_t payload[13] = { 0 };
  payload[0] = currentPreset.bank;
  payload[1] = currentPreset.number;
  payload[2] = currentPreset.masterVolume;
  payload[3] = currentPreset.bpm;
  sendToDSP("PRES", payload, 13);
}

void sendSwitchStateToDSP(int switchIndex, bool switchState) {
  uint8_t payload[13] = { 0 };
  payload[0] = switchIndex;
  payload[1] = switchState ? 1 : 0;
  sendToDSP("SWCH", payload, 2);
}

void setupSwitches() {
  const int switchPins[4] = { SWITCH1_PIN, SWITCH2_PIN, SWITCH3_PIN, SWITCH4_PIN };
  for (int i = 0; i < 4; i++) pinMode(switchPins[i], INPUT_PULLUP);
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
  // (Simplified encoder logic similar to original)
  int enc1Pos = encoder1.getPosition();
  if (enc1Pos != lastEncoder1Pos) {
    state.currentBank = constrain(state.currentBank + (enc1Pos - lastEncoder1Pos), 0, 6);
    lastEncoder1Pos = enc1Pos;
    Serial.printf("[ENC1] Bank: %d\n", state.currentBank);
  }

  if (encoder1.isButtonPressed() && (millis() - lastEncoder1BtnTime > DEBOUNCE_TIME)) {
    if (loadPreset(state.currentBank, state.currentPresetNum, currentPreset)) {
      // Sync UI via BLE if connected (Todo: Add reverse sync logic)
      sendPresetChangeToDSP();
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
    if (state.a2dpEnabled) btManager.enableA2DP(); else btManager.disableA2DP();
    lastEncoder2BtnTime = millis();
  }
}

// ===================================================================
// Setup & Loop
// ===================================================================
void setup() {
  Serial.begin(115200);
  
  if (!SPIFFS.begin(true)) Serial.println("[SPIFFS] Mount Failed");
  initializeFactoryPresets();
  loadSystemState();

  encoder1.begin();
  encoder2.begin();
  setupSwitches();
  
  dspSerial.begin(38400, SERIAL_8N1, DSP_RX_PIN, DSP_TX_PIN);
  
  i2s_pin_config_t i2s_pins = {
    .mck_io_num = I2S_PIN_NO_CHANGE,
    .bck_io_num = 14,
    .ws_io_num = 13,
    .data_out_num = 12,
    .data_in_num = 35
  };
  btManager.setA2DPPinConfig(i2s_pins);

  btManager.begin("JamMate", state.a2dpEnabled);
  btManager.setBLEDataCallback(onBLEDataReceived);
  btManager.setCurrentPreset(&currentPreset);

  Serial.println("[JamMate] v3.0 Ready");
  sendPresetChangeToDSP();
  lastSaveTime = millis();
}

void loop() {
  encoder1.update();
  encoder2.update();
  handleEncoders();
  handleSwitches();
  
  if (millis() - lastSaveTime > SAVE_INTERVAL) {
    saveSystemState();
    lastSaveTime = millis();
  }
  delay(1);
}