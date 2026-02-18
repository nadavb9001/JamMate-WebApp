// ===================================================================
// controller_v2_aligned.ino  —  MODIFIED SECTIONS ONLY
//
// Summary of changes:
//   1. Remove FX_LAYOUT[18][2] static table
//   2. Add FxLayout struct + dynamic fxLayout[] loaded from LittleFS
//   3. Add loadFxConfig() — parses /config.json with ArduinoJson
//   4. Update case 0x20 (SET_PARAM) — flat index, no remapping needed
//   5. Add case 0x50 (UPDATE_CONFIG) — save /config.json, reload
//   6. Update sendEffectChangeToDSP() — uses dynamic counts + flat array
//   7. Update parseBlobToStruct() — reads flat block format
//   8. Update serializeStructToBlob() — writes flat block format
//   9. Call loadFxConfig() in setup()
//
// Requires: ArduinoJson library (v6 or v7)
//   Install via: Sketch → Include Library → Manage Libraries → ArduinoJson
// ===================================================================

// ── ADD to #includes (after existing includes) ──────────────────
#include <ArduinoJson.h>

// ── REMOVE the old FX_LAYOUT table ──────────────────────────────
// DELETE these lines:
//   const uint8_t FX_LAYOUT[18][2] = { ... };


// ── REPLACE with dynamic layout ─────────────────────────────────
// Add these definitions near the top of the file, after includes:

#define MAX_EFFECTS_CONFIG  20   // Max effects the config table can hold
#define MAX_DSP_TAG_LEN      5   // 4 chars + null terminator

struct FxLayout {
  uint8_t k;                    // knob count
  uint8_t d;                    // dropdown count
  char    dsp_tag[MAX_DSP_TAG_LEN]; // 4-char DSP packet header
};

FxLayout fxLayout[MAX_EFFECTS_CONFIG];
uint8_t  fxLayoutCount = 0;     // how many effects are loaded

// ── ADD: loadFxConfig() ─────────────────────────────────────────
// Call this in setup() after LittleFS.begin().
// Reads /config.json (written by UPDATE_CONFIG command 0x50).
// Falls back to hardcoded defaults if file is missing.

void loadFxConfig() {
  // ---- Default hardcoded layout (exact match of config.js as shipped) ----
  // { dsp_tag, k, d }
  const FxLayout DEFAULTS[] = {
    {"GATE", 5,  0},   //  0 Noise Gate
    {"COMP", 8,  0},   //  1 Compressor
    {"AWAH", 9,  3},   //  2 Auto Wah
    {"OVRD", 10, 2},   //  3 Overdrive
    {"DIST", 10, 2},   //  4 Distortion
    {"EQUL", 10, 2},   //  5 Equalizer
    {"HARM", 6,  4},   //  6 Harmonizer
    {"VIBR", 3,  0},   //  7 Vibrato
    {"CHOR", 7,  0},   //  8 Chorus
    {"OCTV", 5,  2},   //  9 Octave
    {"FLNG", 5,  0},   // 10 Flanger
    {"PHAS", 7,  1},   // 11 Phaser
    {"TREM", 4,  2},   // 12 Tremolo
    {"_FIR", 6,  5},   // 13 Amp/Cab
    {"DELY", 9,  3},   // 14 Delay
    {"NAM ", 2,  1},   // 15 NAM
    {"RVRB", 10, 2},   // 16 Reverb
    {"GNRC", 10, 2},   // 17 Generic
  };
  const uint8_t DEFAULT_COUNT = sizeof(DEFAULTS) / sizeof(DEFAULTS[0]);

  // Try to load from LittleFS
  if (LittleFS.exists("/config.json")) {
    File f = LittleFS.open("/config.json", "r");
    if (f) {
      // ArduinoJson v6: StaticJsonDocument / DynamicJsonDocument
      // ArduinoJson v7: JsonDocument (unified)
      JsonDocument doc;
      DeserializationError err = deserializeJson(doc, f);
      f.close();

      if (!err) {
        JsonArray tabs = doc["tabs"].as<JsonArray>();
        uint8_t count  = 0;

        for (JsonObject tab : tabs) {
          if (count >= MAX_EFFECTS_CONFIG) break;

          fxLayout[count].k = tab["k"].as<uint8_t>();
          fxLayout[count].d = tab["d"].as<uint8_t>();

          const char* tag = tab["dsp_tag"] | "GNRC";
          strncpy(fxLayout[count].dsp_tag, tag, MAX_DSP_TAG_LEN - 1);
          fxLayout[count].dsp_tag[MAX_DSP_TAG_LEN - 1] = '\0';

          count++;
        }

        fxLayoutCount = count;
        Serial.printf("[CONFIG] Loaded %d effects from /config.json\n", count);
        return;
      } else {
        Serial.printf("[CONFIG] JSON parse error: %s\n", err.c_str());
      }
    }
  }

  // Fallback to defaults
  Serial.println("[CONFIG] /config.json not found — using defaults");
  fxLayoutCount = DEFAULT_COUNT;
  memcpy(fxLayout, DEFAULTS, sizeof(FxLayout) * DEFAULT_COUNT);
}

// ── Helper: flat param count for effect idx ──────────────────────
// Flat order: [enable(1), knobs(K), dropdowns(D)]  total = 1 + K + D
inline uint8_t flatParamCount(uint8_t fxIdx) {
  if (fxIdx >= fxLayoutCount) return 1;   // safe fallback
  return 1 + fxLayout[fxIdx].k + fxLayout[fxIdx].d;
}


// ================================================================
// MODIFIED: onBLEDataReceived — case 0x20 (SET_PARAM)
// ================================================================
//
// OLD: had a knob/dropdown split using FX_LAYOUT[fx][0].
// NEW: flat index. No remapping needed.
//   flatIdx 0     → enable/disable (stored in effects[fx].enabled)
//   flatIdx 1..K  → knob[flatIdx-1]
//   flatIdx K+1.. → dropdown[flatIdx-1-K]
//
// REPLACE the entire case 0x20 block with:

    case 0x20: {  // SET_PARAM (flat index)
      if (!payload || payloadLen < 3) break;

      uint8_t fx       = payload[0];
      uint8_t flatIdx  = payload[1];
      uint8_t val      = payload[2];

      if (fx >= fxLayoutCount) break;

      uint8_t K = fxLayout[fx].k;
      uint8_t D = fxLayout[fx].d;

      if (flatIdx == 0) {
        // Checkbox — enable/disable
        currentPreset.effects[fx].enabled = (val != 0);
        Serial.printf("[BLE] FX%d Enable: %d\n", fx, val);

      } else if (flatIdx <= K) {
        // Knob
        uint8_t k = flatIdx - 1;
        if (k < MAX_EFFECT_KNOBS) currentPreset.effects[fx].knobs[k] = val;
        Serial.printf("[BLE] FX%d Knob[%d] = %d\n", fx, k, val);

      } else {
        // Dropdown
        uint8_t d = flatIdx - 1 - K;
        if (d < MAX_EFFECT_DROPDOWNS) currentPreset.effects[fx].dropdowns[d] = val;
        Serial.printf("[BLE] FX%d Drop[%d] = %d\n", fx, d, val);
      }

      // Forward the whole effect state to the DSP
      sendEffectChangeToDSP(fx,
        currentPreset.effects[fx].enabled,
        currentPreset.effects[fx].knobs,
        currentPreset.effects[fx].dropdowns);
      break;
    }


// ================================================================
// ADD: case 0x50 — UPDATE_CONFIG
// ================================================================
// Add this inside the switch(cmd) block in onBLEDataReceived().
// Place it after the other cases, before the closing brace.

    case 0x50: {  // UPDATE_CONFIG — receive config.json from webapp
      if (!payload || payloadLen < 2) break;

      // Payload: [lenL][lenH][json bytes...]  (same as createConfigPacket)
      uint16_t jsonLen = payload[0] | (payload[1] << 8);

      // Safety: ensure advertised length fits
      if (jsonLen + 2 > payloadLen) {
        Serial.println("[CONFIG] UPDATE_CONFIG: length mismatch");
        break;
      }

      const uint8_t* jsonBytes = &payload[2];

      // Save to LittleFS
      if (!LittleFS.exists("/")) LittleFS.mkdir("/");
      File f = LittleFS.open("/config.json", "w");
      if (f) {
        f.write(jsonBytes, jsonLen);
        f.close();
        Serial.printf("[CONFIG] Saved /config.json (%d bytes)\n", jsonLen);

        // Reload immediately so next preset ops use new layout
        loadFxConfig();

        // Optional: re-sync DSP with current preset using new layout
        updateDSPFromPreset();
      } else {
        Serial.println("[CONFIG] ERROR: Could not write /config.json");
      }
      break;
    }


// ================================================================
// MODIFIED: sendEffectChangeToDSP
// ================================================================
//
// OLD: used FX_LAYOUT[idx][0/1] for counts.
// NEW: uses fxLayout[idx].k / .d / .dsp_tag dynamically.
//
// DSP payload to Daisy (same as before):
//   [enable, k0, k1, ..., kK-1, d0, d1, ..., dD-1]
// This is the flat array minus only the enable byte being first —
// exactly what every update_param() handler already expects.

void sendEffectChangeToDSP(uint8_t idx, uint8_t en,
                           const uint8_t* k, const uint8_t* d) {
  if (idx >= fxLayoutCount) return;

  uint8_t kCount = fxLayout[idx].k;
  uint8_t dCount = fxLayout[idx].d;
  const char* tag = fxLayout[idx].dsp_tag;

  // Payload: [enable, knob0..knobK-1, drop0..dropD-1]
  // Max = 1 + 10 + 5 = 16 bytes — fits in local buffer
  uint8_t payload[32];
  uint8_t offset = 0;

  payload[offset++] = en ? 1 : 0;

  if (k) {
    for (int i = 0; i < kCount && i < MAX_EFFECT_KNOBS; i++)
      payload[offset++] = k[i];
  }
  if (d) {
    for (int i = 0; i < dCount && i < MAX_EFFECT_DROPDOWNS; i++)
      payload[offset++] = d[i];
  }

  sendPacket(tag, payload, offset);
}


// ================================================================
// MODIFIED: serializeStructToBlob
// ================================================================
//
// OLD: sent [ID][en][kCount=10][knobs x10][dCount=5][drops x5]
//      (always MAX_EFFECT_KNOBS and MAX_EFFECT_DROPDOWNS bytes)
// NEW: sends [ID][flatCount][p0..pN] where flatCount = 1+K+D,
//      p[0]=enable, p[1..K]=knobs, p[K+1..K+D]=dropdowns
//      Only the actual K and D values for this effect are sent.

size_t serializeStructToBlob(const Preset& p, uint8_t* buf) {
  size_t offset = 0;

  // Header
  buf[offset++] = 0x03;  // Version
  buf[offset++] = p.bpm;
  buf[offset++] = p.masterVolume;

  size_t nameLen = strlen(p.name);
  buf[offset++] = (uint8_t)nameLen;
  memcpy(&buf[offset], p.name, nameLen);
  offset += nameLen;

  // Effects — flat block format
  for (int i = 0; i < (int)fxLayoutCount; i++) {
    uint8_t K = fxLayout[i].k;
    uint8_t D = fxLayout[i].d;
    uint8_t flatCount = 1 + K + D;

    buf[offset++] = (uint8_t)i;         // fxId
    buf[offset++] = flatCount;           // total flat params

    // p[0] = enable
    buf[offset++] = p.effects[i].enabled ? 1 : 0;

    // p[1..K] = knobs
    for (int k = 0; k < K && k < MAX_EFFECT_KNOBS; k++)
      buf[offset++] = p.effects[i].knobs[k];

    // p[K+1..K+D] = dropdowns
    for (int d = 0; d < D && d < MAX_EFFECT_DROPDOWNS; d++)
      buf[offset++] = p.effects[i].dropdowns[d];
  }

  // EQ block (unchanged)
  buf[offset++] = 0xFE;
  buf[offset++] = 12;
  for (int i = 0; i < 12; i++) {
    buf[offset++] = (uint8_t)(p.eqPoints[i].freq & 0xFF);
    buf[offset++] = (uint8_t)(p.eqPoints[i].freq >> 8);
    buf[offset++] = (uint8_t)p.eqPoints[i].gain;
    buf[offset++] = p.eqPoints[i].q;
    buf[offset++] = p.eqPoints[i].enabled ? 1 : 0;
  }

  return offset;
}


// ================================================================
// MODIFIED: parseBlobToStruct
// ================================================================
//
// OLD: read [ID][en][kCount][knobs...][dCount][drops...]
// NEW: read [ID][flatCount][p0..pN]
//      p[0]       = enable
//      p[1..K]    = knobs   (derived from fxLayout[ID].k)
//      p[K+1..N]  = drops   (derived from fxLayout[ID].d)

void parseBlobToStruct(const uint8_t* buf, size_t len, Preset& p) {
  if (len < 4) return;
  size_t offset = 0;

  // Header
  uint8_t ver  = buf[offset++];
  p.bpm        = buf[offset++];
  p.masterVolume = buf[offset++];

  uint8_t nameLen = buf[offset++];
  if (offset + nameLen <= len) {
    memset(p.name, 0, 32);
    memcpy(p.name, &buf[offset], min((size_t)nameLen, (size_t)31));
    offset += nameLen;
  }

  // EQ defaults
  for (int i = 0; i < 12; i++) {
    p.eqPoints[i].freq    = (i == 0) ? 80 : (i == 11) ? 8000 : (100 * (i + 1));
    p.eqPoints[i].gain    = 0;
    p.eqPoints[i].q       = 14;
    p.eqPoints[i].enabled = true;
  }

  while (offset < len) {
    uint8_t id = buf[offset++];

    // EQ sentinel
    if (id == 0xFE) {
      if (offset >= len) break;
      uint8_t count = buf[offset++];
      for (int i = 0; i < count && i < 12; i++) {
        if (offset + 5 > len) break;
        p.eqPoints[i].freq    = buf[offset] | (buf[offset+1] << 8);
        p.eqPoints[i].gain    = (int8_t)buf[offset+2];
        p.eqPoints[i].q       = buf[offset+3];
        p.eqPoints[i].enabled = (buf[offset+4] != 0);
        offset += 5;
      }
      continue;
    }

    if (offset >= len) break;
    uint8_t flatCount = buf[offset++];

    if (offset + flatCount > len) break;  // safety: skip corrupt block

    if (id < MAX_EFFECTS && id < fxLayoutCount && flatCount >= 1) {
      uint8_t K = fxLayout[id].k;
      uint8_t D = fxLayout[id].d;

      // p[0] = enable
      p.effects[id].enabled = (buf[offset] != 0);

      // p[1..K] = knobs
      for (int k = 0; k < K && k < MAX_EFFECT_KNOBS && (1+k) < flatCount; k++)
        p.effects[id].knobs[k] = buf[offset + 1 + k];

      // p[K+1..K+D] = dropdowns
      for (int d = 0; d < D && d < MAX_EFFECT_DROPDOWNS && (1+K+d) < flatCount; d++)
        p.effects[id].dropdowns[d] = buf[offset + 1 + K + d];

    } else if (id >= MAX_EFFECTS || id >= fxLayoutCount) {
      // Unknown effect ID — skip block silently (forward-compat)
      Serial.printf("[BLOB] Skipping unknown fxId %d\n", id);
    }

    offset += flatCount;
  }
}


// ================================================================
// MODIFIED: setup() — add loadFxConfig() call
// ================================================================
//
// Inside setup(), after LittleFS.begin() and before
// initializeFactoryPresets(), add:
//
//   loadFxConfig();
//
// Example placement:
//
//   if (!LittleFS.begin(true)) {
//     Serial.println("[FS] Mount Failed");
//   }
//   loadFxConfig();             // <-- ADD THIS LINE
//   initializeFactoryPresets();
//   loadSystemState();
