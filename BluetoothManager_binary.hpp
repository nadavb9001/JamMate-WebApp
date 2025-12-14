#pragma once

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <BLEClient.h> 
#include <BLEScan.h> // Required for scanning
#include "BluetoothA2DPSink.h"

#define BLE_SERVICE_UUID        "6e400001-b5a3-f393-e0a9-e50e24dcca9f"
#define BLE_CHARACTERISTIC_UUID "6e400002-b5a3-f393-e0a9-e50e24dcca9f"

// --- MIDI CONTROLLER CONFIG ---
static BLEAddress midiTargetAddress("34:DE:45:D8:6B:A6");
static BLEUUID    midiServiceUUID("03B80E5A-EDE8-4B33-A751-6CE34EC4C700");
static BLEUUID    midiCharUUID("7772E5DB-3868-4112-A1A9-F2669D106BF3");

class BluetoothManager {
public:
  typedef void (*MidiCallbackFunction)(uint8_t* data, size_t len);
  typedef void (*BLEDataCallback)(uint8_t* data, size_t len);

  static MidiCallbackFunction onMidiReceive;

  BluetoothManager()
    : pServer(nullptr), pControlChar(nullptr), pAdvertising(nullptr),
      bleControlConnected(false), a2dpEnabled(false), bleDataCallback(nullptr),
      pCurrentPreset(nullptr), 
      pMidiClient(nullptr), pRemoteMidiChar(nullptr), midiConnected(false) {}

  void begin(const char* deviceName = "JamMate", bool enableA2DP = false) {
    Serial.println("[BT] Initializing Bluetooth...");
    BLEDevice::init(deviceName);
    BLEDevice::setMTU(517);
    
    // 1. Setup Server (Web App)
    setupBLEGATT();

    // 2. Setup Client (MIDI Controller)
    pMidiClient = BLEDevice::createClient();
    pMidiClient->setClientCallbacks(new MidiClientCallbacks(this));

    // 3. START BACKGROUND TASK
    // Runs on Core 0 to keep main loop (Core 1) free
    xTaskCreatePinnedToCore(
        midiConnectionTask,   
        "MidiTask",           
        8192,                 // Increased stack size just in case
        this,                 
        1,                    
        NULL,                 
        0                     
    );

    if (enableA2DP) {
      setupA2DP();
    }
    Serial.println("[BT] ✓ Bluetooth initialized");
  }

  // ... [Standard Setters - No Changes] ...
  void setA2DPPinConfig(const i2s_pin_config_t& pinConfig) { a2dp_sink.set_pin_config(pinConfig); }
  void setBLEDataCallback(BLEDataCallback callback) { bleDataCallback = callback; }
  void setMidiCallback(MidiCallbackFunction callback) { onMidiReceive = callback; } 
  void setCurrentPreset(Preset* preset) { pCurrentPreset = preset; }

  void enableA2DP() {
    if (!a2dpEnabled) {
      Serial.println("[A2DP] Enabling...");
      a2dp_sink.start("JamMate_Audio"); 
      a2dpEnabled = true;
    }
  }

  void setA2DPvolume(uint8_t volume) {
    if (a2dpEnabled) a2dp_sink.set_volume(volume);
  }

  void disableA2DP() {
    if (a2dpEnabled) {
      a2dp_sink.end();
      a2dpEnabled = false;
    }
  }

  void sendBLEData(const uint8_t* data, size_t len) {
    if (!pControlChar || !bleControlConnected || len == 0) return;
    if (len <= 514) { pControlChar->setValue((uint8_t*)data, len); pControlChar->notify(); }
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

  // MIDI Client
  BLEClient* pMidiClient;
  BLERemoteCharacteristic* pRemoteMidiChar;
  bool midiConnected;

  // --- BACKGROUND TASK ---
  static void midiConnectionTask(void* param) {
      BluetoothManager* instance = (BluetoothManager*)param;
      Serial.println("[MIDI Task] Started on Core 0");
      
      // Setup Polite Scanner
      BLEScan* pBLEScan = BLEDevice::getScan();
      pBLEScan->setActiveScan(true);
      // Interval 100ms, Window 50ms = 50% Duty Cycle
      // This allows Advertising packets to slip out during the 50ms gaps!
      pBLEScan->setInterval(100); 
      pBLEScan->setWindow(50);   

      for(;;) {
          // If NOT connected, search for the pedal
          if (!instance->midiConnected) {
              
              // 1. Scan for 3 seconds (Polite Scan)
              // Serial.println("[MIDI Task] Scanning...");
              BLEScanResults foundDevices = pBLEScan->start(3, false);
              
              bool targetFound = false;
              BLEAdvertisedDevice* targetDevice = nullptr;

              // 2. Check if our pedal is in the results
              for(int i=0; i<foundDevices.getCount(); i++) {
                  BLEAdvertisedDevice device = foundDevices.getDevice(i);
                  if (device.getAddress().equals(midiTargetAddress)) {
                       targetFound = true;
                       // Serial.println("[MIDI Task] Pedal Found!");
                       break;
                  }
              }

              // 3. Connect ONLY if found
              if (targetFound) {
                   pBLEScan->clearResults(); // Clean up memory
                   if (instance->connectToMidiController()) {
                       Serial.println("[MIDI Task] Connected!");
                   }
              } else {
                   pBLEScan->clearResults(); // Clean up memory
                   // Wait 2 seconds before scanning again to save radio time
                   vTaskDelay(2000 / portTICK_PERIOD_MS);
                   
                   // CRITICAL: Ensure advertising is still running!
                   // Sometimes scanning stops advertising on certain ESP32 libraries.
                   if (instance->pAdvertising) instance->pAdvertising->start();
              }
          }
          
          // Loop Check Interval
          vTaskDelay(1000 / portTICK_PERIOD_MS);
      }
  }

  static void midiNotifyCallback(BLERemoteCharacteristic* pChar, uint8_t* data, size_t length, bool isNotify) {
      if (onMidiReceive) {
          onMidiReceive(data, length);
          //Serial.println(data);
      }
  }

  bool connectToMidiController() {
    // Standard connection logic
    if (!pMidiClient->connect(midiTargetAddress)) return false;

    BLERemoteService* pRemoteService = pMidiClient->getService(midiServiceUUID);
    if (!pRemoteService) { pMidiClient->disconnect(); return false; }

    pRemoteMidiChar = pRemoteService->getCharacteristic(midiCharUUID);
    if (!pRemoteMidiChar) { pMidiClient->disconnect(); return false; }

    if(pRemoteMidiChar->canNotify()) {
        pRemoteMidiChar->registerForNotify(midiNotifyCallback);
        Serial.println("[MIDI] ✓ Notifications Registered");
    }

    midiConnected = true;
    return true;
  }

  class MidiClientCallbacks : public BLEClientCallbacks {
      BluetoothManager* mgr;
  public:
      MidiClientCallbacks(BluetoothManager* m) : mgr(m) {}
      void onConnect(BLEClient* client) override {}
      void onDisconnect(BLEClient* client) override {
          Serial.println("[MIDI] Disconnected");
          mgr->midiConnected = false;
      }
  };

  void setupBLEGATT() {
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
    BLEDevice::startAdvertising();
  }
  
  void setupA2DP() {
    a2dp_sink.start("JamMate_Audio");
    a2dpEnabled = true;
  }

  class ServerCallbacks : public BLEServerCallbacks {
  public:
    ServerCallbacks(BluetoothManager* mgr) : manager(mgr) {}
    void onConnect(BLEServer* pServer) override {
      manager->bleControlConnected = true;
      Serial.println("[BLE-CTRL] ✓ WebApp connected");
    }
    void onDisconnect(BLEServer* pServer) override {
      manager->bleControlConnected = false;
      Serial.println("[BLE-CTRL] ✗ WebApp disconnected");
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

inline BluetoothManager::MidiCallbackFunction BluetoothManager::onMidiReceive = nullptr;