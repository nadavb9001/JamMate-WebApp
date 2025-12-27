#pragma once

#include "BluetoothA2DPSink.h"
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "esp_bt_main.h"
#include "esp_bt_device.h"
#include "esp_gap_bt_api.h"
#include "driver/i2s.h"

// UUIDs for WebApp Control
#define BLE_SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9f"
#define BLE_CHARACTERISTIC_UUID "6e400002-b5a3-f393-e0a9-e50e24dcca9f"

class BluetoothManager {
public:
  typedef void (*BLEDataCallback)(uint8_t* data, size_t len);
  typedef void (*MidiCallbackFunction)(uint8_t* data, size_t len); // Dummy for compatibility

  BluetoothManager()
    : pServer(nullptr), pControlChar(nullptr), pAdvertising(nullptr),
      bleControlConnected(false), a2dpEnabled(false), bleDataCallback(nullptr),
      pCurrentPreset(nullptr) {}

  void begin(const char* deviceName = "JamMate", bool enableA2DP = true) {
    Serial.println("[BT] Initializing Hybrid Mode...");

    // ---------------------------------------------------------
    // STEP 1: Start A2DP (Audio) FIRST
    // ---------------------------------------------------------
    // This forces the ESP32 Controller into "Classic/Dual" mode.
    if (enableA2DP) {
      setupA2DP("JamMate Audio"); // Distinct name for Audio
    }

    // ---------------------------------------------------------
    // STEP 2: Initialize BLE Stack
    // ---------------------------------------------------------
    // Attaches to the existing controller started by A2DP.
    BLEDevice::init(deviceName); 
    BLEDevice::setMTU(517);

    // ---------------------------------------------------------
    // STEP 3: Setup WebApp Server (GATT)
    // ---------------------------------------------------------
    setupBLEGATT();

    // ---------------------------------------------------------
    // STEP 4: FORCE CLASSIC BLUETOOTH VISIBILITY
    // ---------------------------------------------------------
    // Explicitly make the device discoverable for Audio connections.
    esp_bt_gap_set_scan_mode(ESP_BT_CONNECTABLE, ESP_BT_GENERAL_DISCOVERABLE);

    Serial.println("[BT] ✓ Hybrid Mode Ready");
    Serial.println("[BT] Look for 'JamMate Audio' in Bluetooth Settings");
  }

  // --- Configuration ---
  void setA2DPPinConfig(const i2s_pin_config_t& pinConfig) { 
      a2dp_sink.set_pin_config(pinConfig); 
  }
  
  void setBLEDataCallback(BLEDataCallback callback) { bleDataCallback = callback; }
  void setMidiCallback(MidiCallbackFunction callback) {} // Empty (MIDI Removed)
  void setCurrentPreset(Preset* preset) { pCurrentPreset = preset; }
  void startMidiScan() {} 

  // --- A2DP Control ---
  void enableA2DP() {
    if (!a2dpEnabled) {
      setupA2DP("JamMate Audio"); 
    }
  }

  void disableA2DP() {
    if (a2dpEnabled) {
      a2dp_sink.end();
      a2dpEnabled = false;
    }
  }

  void setA2DPvolume(uint8_t volume) {
    if (a2dpEnabled) a2dp_sink.set_volume(volume);
  }

  // --- Data Sending ---
  void sendBLEData(const uint8_t* data, size_t len) {
    if (!pControlChar || !bleControlConnected || len == 0) return;
    if (len <= 514) { 
        pControlChar->setValue((uint8_t*)data, len); 
        pControlChar->notify(); 
    }
  }

  void sendBLEDataChunked(const uint8_t* data, size_t totalLen, size_t chunkSize = 512) {
    if (!pControlChar || !bleControlConnected || totalLen == 0) return;
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
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new ServerCallbacks(this));
    
    BLEService* pService = pServer->createService(BLE_SERVICE_UUID);
    pControlChar = pService->createCharacteristic(
      BLE_CHARACTERISTIC_UUID,
      BLECharacteristic::PROPERTY_WRITE | 
      BLECharacteristic::PROPERTY_READ | 
      BLECharacteristic::PROPERTY_NOTIFY | 
      BLECharacteristic::PROPERTY_WRITE_NR
    );
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
    BLEDevice::startAdvertising();
  }
  
  void setupA2DP(const char* name) {
    // 1. Task Config: Core 1 (App Core) to avoid BLE/System conflict
    a2dp_sink.set_task_core(1);
    a2dp_sink.set_task_priority(10); 

    // 2. I2S Config (Moderate Buffering for Stability)
    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX),
        .sample_rate = 44100,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
        .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = 0,
        .dma_buf_count = 16,   
        .dma_buf_len = 128,    
        .use_apll = false,
        .tx_desc_auto_clear = true
    };
    a2dp_sink.set_i2s_config(i2s_config);

    // 3. Start A2DP
    a2dp_sink.start(name);
    a2dpEnabled = true;

    // 4. Force "Loudspeaker" Class of Device
    esp_bt_cod_t cod;
    cod.major = 0b00100;        
    cod.minor = 0b000100;       
    cod.service = 0b0010000000; 
    esp_bt_gap_set_cod(cod, ESP_BT_INIT_COD);
  }

  class ServerCallbacks : public BLEServerCallbacks {
  public:
    ServerCallbacks(BluetoothManager* mgr) : manager(mgr) {}
    void onConnect(BLEServer* pServer) override {
      manager->bleControlConnected = true;
      Serial.println("[BLE] WebApp connected");
      // updateConnParams removed to fix compilation error
    }
    void onDisconnect(BLEServer* pServer) override {
      manager->bleControlConnected = false;
      Serial.println("[BLE] WebApp disconnected");
      delay(100);
      manager->pAdvertising->start();
    }
  private:
    BluetoothManager* manager;
  };

  class CharacteristicCallbacks : public BLECharacteristicCallbacks {
  public:
    CharacteristicCallbacks(BluetoothManager* mgr) : manager(mgr) {}
    void onWrite(BLECharacteristic* pCharacteristic) override {
      std::string value = pCharacteristic->getValue();
      if (value.length() > 0 && manager->bleDataCallback) {
        manager->bleDataCallback((uint8_t*)value.data(), value.length());
      }
    }
  private:
    BluetoothManager* manager;
  };
};