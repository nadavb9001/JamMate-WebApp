#pragma once

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "BluetoothA2DPSink.h"

#define BLE_SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9f"
#define BLE_CHARACTERISTIC_UUID "6e400002-b5a3-f393-e0a9-e50e24dcca9f"

// Forward declarations
struct Preset;
struct PresetBinary;
class PresetBinaryCodec;

class BluetoothManager {
public:
  typedef void (*BLEDataCallback)(uint8_t* data, size_t len);

  BluetoothManager()
    : pServer(nullptr), pControlChar(nullptr), pAdvertising(nullptr),
      bleControlConnected(false), a2dpEnabled(false), bleDataCallback(nullptr),
      pCurrentPreset(nullptr) {}

  void begin(const char* deviceName = "JamMate", bool enableA2DP = false) {
    Serial.println("[BT] Initializing Bluetooth...");
    BLEDevice::init(deviceName);
    BLEDevice::setMTU(517);
    setupBLEGATT();
    if (enableA2DP) {
      setupA2DP();
    }
    Serial.println("[BT] ✓ Bluetooth initialized");
  }

  void setA2DPPinConfig(const i2s_pin_config_t& pinConfig) {
    a2dp_sink.set_pin_config(pinConfig);
  }

  void setBLEDataCallback(BLEDataCallback callback) {
    bleDataCallback = callback;
  }

  // ✓ NEW: Set pointer to current preset
  void setCurrentPreset(Preset* preset) {
    pCurrentPreset = preset;
  }

  void enableA2DP() {
    if (!a2dpEnabled) {
      Serial.println("[A2DP] Enabling...");
      a2dp_sink.start("JamMate_Audio");
      a2dpEnabled = true;
      Serial.println("[A2DP] ✓ Enabled");
    }
  }

  void disableA2DP() {
    if (a2dpEnabled) {
      Serial.println("[A2DP] Disabling...");
      a2dp_sink.end();
      a2dpEnabled = false;
      Serial.println("[A2DP] ✗ Disabled");
    }
  }

  bool isA2DPEnabled() const {
    return a2dpEnabled;
  }

  bool isBLEConnected() const {
    return bleControlConnected;
  }

  void sendBLEAck() {
    if (pControlChar && bleControlConnected) {
      uint8_t ack[1] = { 0xAA };
      pControlChar->setValue(ack, 1);
      pControlChar->notify();
    }
  }

  void sendBLEData(const uint8_t* data, size_t len) {
    if (!pControlChar || !bleControlConnected || len == 0) {
      return;
    }
    if (len <= 514) {
      pControlChar->setValue((uint8_t*)data, len);
      pControlChar->notify();
    } else {
      Serial.printf("[BLE] ✗ Payload too large: %d bytes (max 514)\n", len);
    }
  }

  void sendBLEDataChunked(const uint8_t* data, size_t totalLen, size_t chunkSize = 512) {
    if (!pControlChar || !bleControlConnected || totalLen == 0) {
      return;
    }
    for (size_t offset = 0; offset < totalLen; offset += chunkSize) {
      size_t remaining = totalLen - offset;
      size_t toSend = (remaining < chunkSize) ? remaining : chunkSize;
      pControlChar->setValue((uint8_t*)(data + offset), toSend);
      pControlChar->notify();
      delay(20);
    }
  }

private:
  BLEServer* pServer;
  BLECharacteristic* pControlChar;
  BLEAdvertising* pAdvertising;
  bool bleControlConnected;
  bool a2dpEnabled;
  BluetoothA2DPSink a2dp_sink;
  BLEDataCallback bleDataCallback;
  Preset* pCurrentPreset;  // ✓ Pointer to current preset

  void setupBLEGATT() {
    Serial.println("[BLE-GATT] Setting up server...");
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks(this));

    BLEService* pService = pServer->createService(BLE_SERVICE_UUID);

    pControlChar = pService->createCharacteristic(
      BLE_CHARACTERISTIC_UUID,
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_WRITE_NR);

    pControlChar->setCallbacks(new CharacteristicCallbacks(this));
    pControlChar->addDescriptor(new BLE2902());

    const char* initMsg = "JamMate_Ready";
    pControlChar->setValue((uint8_t*)initMsg, strlen(initMsg));

    pService->start();

    pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(BLE_SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    pAdvertising->setMinPreferred(0x06);
    pAdvertising->setMaxPreferred(0x12);
    pAdvertising->setAppearance(0);
    BLEDevice::startAdvertising();

    Serial.println("[BLE-GATT] ✓ Advertising started");
    Serial.printf("[BLE-GATT] Service UUID: %s\n", BLE_SERVICE_UUID);
    Serial.printf("[BLE-GATT] Characteristic UUID: %s\n", BLE_CHARACTERISTIC_UUID);
  }

  void setupA2DP() {
    Serial.println("[A2DP] Starting Audio Sink...");
    a2dp_sink.start("JamMate_Audio");
    a2dpEnabled = true;
    Serial.println("[A2DP] ✓ Ready - Device: 'JamMate_Audio'");
  }

  class ServerCallbacks : public BLEServerCallbacks {
  public:
    ServerCallbacks(BluetoothManager* mgr)
      : manager(mgr) {}

    void onConnect(BLEServer* pServer) override {
      manager->bleControlConnected = true;
      Serial.println("[BLE-CTRL] ✓ Client connected");
    }

    void onDisconnect(BLEServer* pServer) override {
      manager->bleControlConnected = false;
      Serial.println("[BLE-CTRL] ✗ Client disconnected - restarting advertising");
      delay(100);
      manager->pAdvertising->start();
    }

  private:
    BluetoothManager* manager;
  };

  /*class CharacteristicCallbacks : public BLECharacteristicCallbacks {
  public:
    CharacteristicCallbacks(BluetoothManager* mgr)
      : manager(mgr) {}

    void onWrite(BLECharacteristic* pCharacteristic) override {
      std::string value = pCharacteristic->getValue();
      uint8_t* pData = (uint8_t*)value.data();
      size_t len = value.length();

      if (len == 0) return;

      // ✓ Check if preset pointer is set
      if (!manager->pCurrentPreset) {
        Serial.println("[BLE-RX] ✗ Current preset not initialized");
        return;
      }

      uint8_t cmd = pData[0];
      Serial.printf("[BLE-RX] Command 0x%02X, Length %d\n", cmd, len);

      switch(cmd) {
        case 0x13: { // SAVE_CUSTOM_PRESET
          Serial.println("[BLE-CMD] CMD_SAVE_CUSTOM_PRESET (0x13)");
          if (len < 298) {
            Serial.printf("[BLE-CMD] ✗ Invalid length: %d (need 298)\n", len);
            break;
          }

          uint8_t* presetData = &pData[1];
          
          // ✓ Use pointer to current preset
          if (!PresetBinaryCodec::convertFromBinary(*(PresetBinary*)presetData, *(manager->pCurrentPreset))) {
            Serial.println("[BLE-CMD] ✗ Invalid preset data");
            break;
          }

          Serial.println("[BLE-CMD] ✓ Preset valid, saving to SPIFFS...");
          
          // Send ACK
          uint8_t ack = 0xAA;
          pCharacteristic->setValue(&ack, 1);
          pCharacteristic->notify();
          Serial.println("[BLE-TX] ✓ ACK sent");
          break;
        }

        case 0x14: { // EFFECT_UPDATE - Single effect change
          Serial.println("[BLE-CMD] CMD_EFFECT_UPDATE (0x14)");
          if (len < 17) {
            Serial.printf("[BLE-CMD] ✗ Invalid length: %d (need 17)\n", len);
            break;
          }

          uint8_t effectIdx = pData[1];
          if (effectIdx >= 17) {
            Serial.printf("[BLE-CMD] ✗ Invalid effect index: %d\n", effectIdx);
            break;
          }

          uint8_t enabled = pData[2];
          uint8_t knobs[10];
          uint8_t drops[4];
          memcpy(knobs, &pData[3], 10);  // Bytes 3-12: knobs
          memcpy(drops, &pData[13], 4);  // Bytes 13-16: dropdowns

          // ✓ Update current preset using pointer
          manager->pCurrentPreset->effects[effectIdx].enabled = (enabled != 0);
          memcpy(manager->pCurrentPreset->effects[effectIdx].knobs, knobs, 10);
          memcpy(manager->pCurrentPreset->effects[effectIdx].dropdowns, drops, 4);

          Serial.printf("[BLE-CMD] ✓ Effect %d updated: en=%d\n", effectIdx, enabled);

          // Send ACK
          uint8_t ack = 0xAA;
          pCharacteristic->setValue(&ack, 1);
          pCharacteristic->notify();
          break;
        }

        case 0x12: { // LOAD_PRESET
          Serial.println("[BLE-CMD] CMD_LOAD_PRESET (0x12)");
          if (len < 3) {
            Serial.printf("[BLE-CMD] ✗ Invalid length: %d (need 3)\n", len);
            break;
          }

          uint8_t bank = pData[1];
          uint8_t number = pData[2];
          if (bank > 6 || number > 4) {
            Serial.printf("[BLE-CMD] ✗ Invalid bank/number: %d/%d\n", bank, number);
            break;
          }

          Serial.printf("[BLE-CMD] Loading Bank %d, Preset %d\n", bank, number);
          
          // Load preset from SPIFFS or factory
          // This should be handled by the main application
          // For now, send current preset as response
          
          PresetBinary binary;
          PresetBinaryCodec::convertToBinary(*(manager->pCurrentPreset), binary);
          pCharacteristic->setValue((uint8_t*)&binary, sizeof(PresetBinary));
          pCharacteristic->notify();
          Serial.printf("[BLE-TX] ✓ Sent preset: Bank %d, Preset %d (%d bytes)\n",
                        bank, number, sizeof(PresetBinary));
          break;
        }

        case 0x10: { // GET_CURRENT_STATE
          Serial.println("[BLE-CMD] CMD_GET_CURRENT_STATE (0x10)");
          
          // ✓ Send current preset as binary using pointer
          PresetBinary binary;
          PresetBinaryCodec::convertToBinary(*(manager->pCurrentPreset), binary);
          pCharacteristic->setValue((uint8_t*)&binary, sizeof(PresetBinary));
          pCharacteristic->notify();
          Serial.printf("[BLE-TX] ✓ Sent current state (%d bytes)\n", sizeof(PresetBinary));
          break;
        }

        default:
          Serial.printf("[BLE-CMD] Unknown command: 0x%02X\n", cmd);
          break;
      }
    }

  private:
    BluetoothManager* manager;
  };*/
  class CharacteristicCallbacks : public BLECharacteristicCallbacks {
  public:
    CharacteristicCallbacks(BluetoothManager* mgr)
      : manager(mgr) {}

    void onWrite(BLECharacteristic* pCharacteristic) override {
      std::string value = pCharacteristic->getValue();
      uint8_t* pData = (uint8_t*)value.data();
      size_t len = value.length();

      if (len == 0) return;

      // Just delegate to the app-level callback
      if (manager->bleDataCallback) {
        manager->bleDataCallback(pData, len);
      }
    }

  private:
    BluetoothManager* manager;
  };
};