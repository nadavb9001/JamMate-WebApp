#pragma once

// ===================================================================
// Binary Preset Protocol Definition - FIXED CHECKSUM
// ===================================================================

#include <cstring>
#include <cstdint>

#define PRESET_MAGIC_BYTE_1     0x50
#define PRESET_MAGIC_BYTE_2     0x4D
#define PRESET_PROTOCOL_VERSION 0x02
#define MAX_EFFECTS             17
#define MAX_EFFECT_KNOBS        10
#define MAX_EFFECT_DROPDOWNS    4
#define PRESET_NAME_LENGTH      32

const char* EFFECT_NAMES[MAX_EFFECTS] = {
    "Gate", "Comp", "Awah", "Ovrd", "Dist", "Equl", "Harm",
    "Vibr", "Chor", "Octv", "Flng", "Phas", "Trem", "FIR ",
    "Dely", "NAM ", "Rvrb"
};

struct EffectParams {
    bool enabled;
    uint8_t knobs[MAX_EFFECT_KNOBS];
    uint8_t dropdowns[MAX_EFFECT_DROPDOWNS];
};

struct Preset {
    char name[PRESET_NAME_LENGTH];
    uint8_t bank;
    uint8_t number;
    uint8_t masterVolume;
    uint8_t bpm;
    EffectParams effects[MAX_EFFECTS];
};

struct PresetBinary {
    uint8_t magic[2];
    uint8_t version;
    uint8_t bank;
    uint8_t number;
    uint8_t masterVolume;
    uint8_t bpm;
    uint8_t numEffects;
    char name[PRESET_NAME_LENGTH];
    
    struct EffectState {
        uint8_t enabled;
        uint8_t knobs[MAX_EFFECT_KNOBS];
        uint8_t dropdowns[MAX_EFFECT_DROPDOWNS];
    } effects[MAX_EFFECTS];
    
    uint16_t checksum;
} __attribute__((packed));

static_assert(sizeof(PresetBinary) == 297, "PresetBinary must be exactly 297 bytes");

class PresetBinaryCodec {
public:
    // ===================================================================
    // CRITICAL: CRC16 calculation - matches webapp exactly
    // ===================================================================
    static uint16_t calculateChecksum(const uint8_t* data, size_t len) {
        uint16_t crc = 0xFFFF;
        for (size_t i = 0; i < len; i++) {
            crc ^= data[i];
            for (int j = 0; j < 8; j++) {
                if (crc & 1) {
                    crc = (crc >> 1) ^ 0xA001;
                } else {
                    crc >>= 1;
                }
            }
        }
        return crc;
    }
    
    // Verify binary preset structure
    static bool verifyChecksum(const PresetBinary* preset) {
        // Calculate checksum over ALL bytes EXCEPT the checksum field (last 2 bytes)
        uint16_t calculated = calculateChecksum(
            (uint8_t*)preset,
            sizeof(PresetBinary) - sizeof(uint16_t)
        );
        
        if (calculated != preset->checksum) {
            Serial.printf("[CHECKSUM] ✗ Mismatch - Calculated: 0x%04X, Received: 0x%04X\n", 
                calculated, preset->checksum);
            return false;
        }
        
        Serial.printf("[CHECKSUM] ✓ Valid: 0x%04X\n", calculated);
        return true;
    }
    
    // Verify effect order and count
    static bool verifyEffectOrder(const PresetBinary* binary) {
        if (binary->numEffects != MAX_EFFECTS) {
            Serial.printf("[PRESET-BIN] ✗ Invalid effect count: %d (expected %d)\n", 
                binary->numEffects, MAX_EFFECTS);
            return false;
        }
        return true;
    }
    
    // Convert Preset struct to PresetBinary WITH CHECKSUM
    static void convertToBinary(const Preset& source, PresetBinary& binary) {
        memset(&binary, 0, sizeof(PresetBinary));
        
        // Set magic and version
        binary.magic[0] = PRESET_MAGIC_BYTE_1;
        binary.magic[1] = PRESET_MAGIC_BYTE_2;
        binary.version = PRESET_PROTOCOL_VERSION;
        
        // Copy metadata
        binary.bank = source.bank;
        binary.number = source.number;
        binary.masterVolume = source.masterVolume;
        binary.bpm = source.bpm;
        binary.numEffects = MAX_EFFECTS;
        strncpy(binary.name, source.name, PRESET_NAME_LENGTH - 1);
        
        // Copy effects
        for (int i = 0; i < MAX_EFFECTS; i++) {
            binary.effects[i].enabled = source.effects[i].enabled ? 1 : 0;
            memcpy(binary.effects[i].knobs, source.effects[i].knobs, MAX_EFFECT_KNOBS);
            memcpy(binary.effects[i].dropdowns, source.effects[i].dropdowns, MAX_EFFECT_DROPDOWNS);
        }
        
        // ✓ Calculate and set checksum LAST
        // Calculate over ALL bytes EXCEPT the checksum field itself
        binary.checksum = calculateChecksum(
            (uint8_t*)&binary,
            sizeof(PresetBinary) - sizeof(uint16_t)
        );
        
        Serial.printf("[BINARY-ENCODE] ✓ Checksum calculated: 0x%04X\n", binary.checksum);
    }
    
    // Convert PresetBinary to Preset struct WITH CHECKSUM VALIDATION
    static bool convertFromBinary(const PresetBinary& binary, Preset& destination) {
        // Verify magic bytes
        if (binary.magic[0] != PRESET_MAGIC_BYTE_1 || binary.magic[1] != PRESET_MAGIC_BYTE_2) {
            Serial.println("[PRESET-BIN] ✗ Invalid magic bytes");
            return false;
        }
        
        // Verify version
        if (binary.version != PRESET_PROTOCOL_VERSION) {
            Serial.printf("[PRESET-BIN] ⚠ Version mismatch: received %d, expected %d\n", 
                binary.version, PRESET_PROTOCOL_VERSION);
        }
        
        // Verify effect count
        if (!verifyEffectOrder(&binary)) {
            return false;
        }
        
        // ✓ CRITICAL: Verify checksum BEFORE parsing data
        if (!verifyChecksum(&binary)) {
            Serial.println("[PRESET-BIN] ✗ Checksum failed - data may be corrupted");
            return false;
        }
        
        // Copy metadata
        destination.bank = binary.bank;
        destination.number = binary.number;
        destination.masterVolume = binary.masterVolume;
        destination.bpm = binary.bpm;
        strncpy(destination.name, binary.name, sizeof(destination.name) - 1);
        
        // Copy effects
        for (int i = 0; i < MAX_EFFECTS; i++) {
            destination.effects[i].enabled = binary.effects[i].enabled != 0;
            memcpy(destination.effects[i].knobs, binary.effects[i].knobs, MAX_EFFECT_KNOBS);
            memcpy(destination.effects[i].dropdowns, binary.effects[i].dropdowns, MAX_EFFECT_DROPDOWNS);
        }
        
        Serial.println("[PRESET-BIN] ✓ Binary conversion successful");
        return true;
    }
    
    // Print binary data as hex (for debugging)
    static void debugPrint(const PresetBinary* binary) {
        Serial.printf("[PRESET-BIN] %s (Bank %d, Num %d) - Size: %d bytes\n",
            binary->name, binary->bank, binary->number, (int)sizeof(PresetBinary)
        );
        Serial.println("[PRESET-BIN] Effect states:");
        for (int i = 0; i < MAX_EFFECTS; i++) {
            Serial.printf("  [%2d] %s: %s | K:", i, EFFECT_NAMES[i], 
                binary->effects[i].enabled ? "ON " : "OFF");
            for (int k = 0; k < MAX_EFFECT_KNOBS; k++) {
                Serial.printf("%3d ", binary->effects[i].knobs[k]);
            }
            Serial.print("| D:");
            for (int d = 0; d < MAX_EFFECT_DROPDOWNS; d++) {
                Serial.printf("%d ", binary->effects[i].dropdowns[d]);
            }
            Serial.println();
        }
    }
    
    // Validate preset data integrity
    static bool validatePreset(const Preset& preset) {
        if (preset.bank > 6 || preset.number > 4) {
            Serial.printf("[PRESET-VALIDATE] ✗ Invalid bank/number: %d/%d\n", 
                preset.bank, preset.number);
            return false;
        }
        return true;
    }
};