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

  void setA2DPvolume(uint8_t volume) {
    if (a2dpEnabled) {
      
      a2dp_sink.set_volume( volume);
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
  
  // New method to force advertising start if disconnected
  void startAdvertising() {
      if (pAdvertising && !bleControlConnected) {
          pAdvertising->start();
          Serial.println("[BLE] Advertising started manually");
      }
  }
  
  // New method to stop advertising/disconnect
  void stopAdvertising() {
      if (pServer) {
          // If connected, this might require more logic depending on library version
          // but stopping advertising prevents new connections.
           if (pAdvertising) pAdvertising->stop();
           // Ideally we'd disconnect any active client here too if we want a "hard" off
           // pServer->disconnect(0); // Disconnect client ID 0 (usually the first)
           Serial.println("[BLE] Advertising stopped");
      }
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
  Preset* pCurrentPreset; 

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
    
    // Start advertising by default
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
      // Restart advertising so we can reconnect
      manager->pAdvertising->start();
    }

  private:
    BluetoothManager* manager;
  };

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