#include "DisplayManager.h"
#include "BluetoothManager_binary.hpp" 

DisplayManager display;

// ===================================================================
// STATIC PARAMETER DATA (Mirrors config.js)
// ===================================================================

// Gate
const char* lbl_Gate_K[] = { "Thresh", "Hold", "Attack", "Rel", "Level" };
// Comp
const char* lbl_Comp_K[] = { "Level", "Ratio", "Thresh", "Attack", "Rel", "Wet", "Dry", "MakeUp" };
// Auto Wah
const char* lbl_Awah_K[] = { "Level", "Wah", "Dry", "Wet", "Rate", "Start", "Stop" };
// Overdrive
const char* lbl_Ovrd_K[] = { "Level", "Drive", "Type", "PreLP", "PreHP", "PstLP", "PstHP", "MidF", "MidG", "Blend" };
const char* lbl_Ovrd_D[] = { "Type", "Brand" };
// Distortion
const char* lbl_Dist_K[] = { "Level", "Drive", "Type", "PreLP", "PreHP", "PstLP", "PstHP", "MidF", "MidG", "Blend" };
const char* lbl_Dist_D[] = { "Type", "Brand" };
// EQ
const char* lbl_Equl_K[] = { "Level", "HPF", "100", "200", "400", "800", "1.6k", "3.2k", "LPF", "Q" };
const char* lbl_Equl_D[] = { "Type", "Scale" }; // Added Dropdowns based on config.js
// Harmonizer
const char* lbl_Harm_K[] = { "Level", "Dry", "Wet1", "Wet2", "Arpeg", "Rate" };
const char* lbl_Harm_D[] = { "Scale", "Mode", "Wet1", "Wet2" };
// Vibrato
const char* lbl_Vibr_K[] = { "Rate", "Depth", "Fluttr" };
// Chorus
const char* lbl_Chor_K[] = { "Level", "Rate", "Depth", "Delay", "Fdbk", "Wet", "Dry" };
// Octave
const char* lbl_Octv_K[] = { "Level", "Dry", "Wet", "Shift", "Buf" };
const char* lbl_Octv_D[] = { "Semi", "Dir" };
// Flanger
const char* lbl_Flng_K[] = { "Level", "Rate", "Depth", "Fdbk", "Delay" };
// Phaser
const char* lbl_Phas_K[] = { "Level", "Rate", "Depth", "Freq", "Fdbk", "Wet", "Dry" };
const char* lbl_Phas_D[] = { "Poles" };
// Tremolo
const char* lbl_Trem_K[] = { "Level", "Depth", "Rate", "MidF" };
const char* lbl_Trem_D[] = { "Mode", "Wave" };
// FIR
const char* lbl_Fir_K[]  = { "Level", "Treble", "Mid", "Bass", "Pres", "Gain" };
const char* lbl_Fir_D[]  = { "Amp", "Tone", "Pts", "Type", "File" };
// Delay
const char* lbl_Dely_K[] = { "Level", "Fdbk", "Time", "LPF", "Dry", "Wet", "Depth", "Rate", "S/P" };
const char* lbl_Dely_D[] = { "Type", "Div", "Multi" };
// NAM
const char* lbl_Nam_K[]  = { "Level", "PreAtt" };
const char* lbl_Nam_D[]  = { "Model" };
// Reverb
const char* lbl_Rvrb_K[] = { "Level", "Fdbk", "Damp", "Dry", "Wet", "Freez", "Gain", "Depth", "Rate", "Type" };
const char* lbl_Rvrb_D[] = { "Eng", "Type" };
// Generic
const char* lbl_Gnrc_K[] = { "Lvl", "P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9" };
const char* lbl_Gnrc_D[] = { "G1", "G2" };

// ===================================================================
// DROPDOWN OPTION DATA (Mirrors config.js)
// ===================================================================

// --- Shared / Common ---
const char* opt_None[] = { "None" }; // Fallback

// --- NAM ---
const char* opt_NAM_Models[] = { "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25" };

// --- Amp/Cab (FIR) ---
const char* opt_AmpType[] = { "None", "Fender", "Twin", "Marsh", "Orange", "Mesa", "EVH", "Fried", "VOX", "Bass", "Cust" };
const char* opt_ToneType[] = { "None", "Fender", "Marsh" };
const char* opt_IRPoints[] = { "256", "512", "1024", "2048", "4096", "8192" };
const char* opt_IRType[] = { "FIR", "FFT", "Conv" };
const char* opt_IRFile[] = { "1", "2", "3" };

// --- Distortion / Overdrive ---
const char* opt_DistType[] = { "Exp", "Soft", "Hard", "HiGain", "Fuzz", "Assym", "Multi", "Tube", "BitCr" };
const char* opt_DistBrand[] = { "Rat", "DS2", "M_Zone", "MXR+", "Muff" };
const char* opt_OvrdBrand[] = { "TubeScr", "Blues", "Klon", "ODR1" };

// --- Modulation (Chorus/Phaser/Trem/Vibr) ---
const char* opt_PhaserPoles[] = { "1", "2", "3", "4" };
const char* opt_TremMode[] = { "Vint", "Harm" };
const char* opt_Waveform[] = { "Sine", "Tri", "Saw", "Sqr" };

// --- Delay ---
const char* opt_DelayType[] = { "Digi", "Echo", "Tape", "Multi", "Mod", "Ping", "Duck" };
const char* opt_Division[] = { "1/32", "1/16", "1/16t", "1/16d", "1/8", "1/8t", "1/8d", "1/4", "1/4t", "1/4d", "1/2", "1" };
const char* opt_DelayMulti[] = { "1", "2", "3" };

// --- Reverb ---
const char* opt_RvrbEng[] = { "Free", "Datt" };
const char* opt_RvrbType[] = { "Room", "Hall", "Plate", "Sprng" };

// --- Pitch / Octave / Harm ---
const char* opt_ShiftDir[] = { "Up", "Down" };
const char* opt_ShiftSemi[] = { "Detune", "1", "2", "3", "4", "5", "6", "7", "8", "9", "11", "12" };
const char* opt_Scale[] = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" };
const char* opt_Mode[] = { "Maj", "Min", "H.Min", "M.Min", "Lyd", "Mixo", "Phry", "Dor", "Loc" };
const char* opt_HarmWet[] = { "2", "3", "4", "5", "6" };

// --- EQ ---
const char* opt_EQType[] = { "Neut", "Scoop", "Mid+", "Bass+", "Treb+" };
const char* opt_EQScale[] = { "100%", "75%", "50%", "125%", "150%" };

// --- Generic ---
const char* opt_Gen1[] = { "A1", "B1", "C1", "D1", "E1" };
const char* opt_Gen2[] = { "A2", "B2", "C2", "D2", "E2" };

// ===================================================================
// GROUPING ARRAYS (Effect-Specific Mappings)
// ===================================================================

// OVRD
const char** opts_Ovrd[] = { opt_DistType, opt_OvrdBrand };
const uint8_t cnts_Ovrd[] = { 9, 4 };

// DIST
const char** opts_Dist[] = { opt_DistType, opt_DistBrand };
const uint8_t cnts_Dist[] = { 9, 5 };

// EQUL
const char** opts_Equl[] = { opt_EQType, opt_EQScale };
const uint8_t cnts_Equl[] = { 5, 5 };

// HARM
const char** opts_Harm[] = { opt_Scale, opt_Mode, opt_HarmWet, opt_HarmWet };
const uint8_t cnts_Harm[] = { 12, 9, 5, 5 };

// OCTV
const char** opts_Octv[] = { opt_ShiftSemi, opt_ShiftDir };
const uint8_t cnts_Octv[] = { 12, 2 };

// PHAS
const char** opts_Phas[] = { opt_PhaserPoles };
const uint8_t cnts_Phas[] = { 4 };

// TREM
const char** opts_Trem[] = { opt_TremMode, opt_Waveform };
const uint8_t cnts_Trem[] = { 2, 4 };

// FIR (Amp/Cab)
const char** opts_Fir[] = { opt_AmpType, opt_ToneType, opt_IRPoints, opt_IRType, opt_IRFile };
const uint8_t cnts_Fir[] = { 11, 3, 6, 3, 3 };

// DELY
const char** opts_Dely[] = { opt_DelayType, opt_Division, opt_DelayMulti };
const uint8_t cnts_Dely[] = { 7, 12, 3 };

// NAM
const char** opts_Nam[] = { opt_NAM_Models };
const uint8_t cnts_Nam[] = { 25 };

// RVRB
const char** opts_Rvrb[] = { opt_RvrbEng, opt_RvrbType };
const uint8_t cnts_Rvrb[] = { 2, 4 };

// GNRC
const char** opts_Gnrc[] = { opt_Gen1, opt_Gen2 };
const uint8_t cnts_Gnrc[] = { 5, 5 };

const FxLayout DisplayManager::fxLayouts[TOTAL_FX] = {
    { 5, lbl_Gate_K, 0, nullptr, nullptr, nullptr },      // Gate
    { 8, lbl_Comp_K, 0, nullptr, nullptr, nullptr },      // Comp
    { 7, lbl_Awah_K, 0, nullptr, nullptr, nullptr },      // Awah
    { 10, lbl_Ovrd_K, 2, lbl_Ovrd_D, opts_Ovrd, cnts_Ovrd }, // Ovrd
    { 10, lbl_Dist_K, 2, lbl_Dist_D, opts_Dist, cnts_Dist }, // Dist
    { 10, lbl_Equl_K, 2, lbl_Equl_D, opts_Equl, cnts_Equl }, // Equl
    { 6, lbl_Harm_K, 4, lbl_Harm_D, opts_Harm, cnts_Harm },  // Harm
    { 3, lbl_Vibr_K, 0, nullptr, nullptr, nullptr },      // Vibr
    { 7, lbl_Chor_K, 0, nullptr, nullptr, nullptr },      // Chor
    { 5, lbl_Octv_K, 2, lbl_Octv_D, opts_Octv, cnts_Octv },  // Octv
    { 5, lbl_Flng_K, 0, nullptr, nullptr, nullptr },      // Flng
    { 7, lbl_Phas_K, 1, lbl_Phas_D, opts_Phas, cnts_Phas },  // Phas
    { 4, lbl_Trem_K, 2, lbl_Trem_D, opts_Trem, cnts_Trem },  // Trem
    { 6, lbl_Fir_K, 5, lbl_Fir_D, opts_Fir, cnts_Fir },      // FIR
    { 9, lbl_Dely_K, 3, lbl_Dely_D, opts_Dely, cnts_Dely },  // Dely
    { 2, lbl_Nam_K, 1, lbl_Nam_D, opts_Nam, cnts_Nam },      // NAM
    { 10, lbl_Rvrb_K, 2, lbl_Rvrb_D, opts_Rvrb, cnts_Rvrb }, // Rvrb
    { 10, lbl_Gnrc_K, 2, lbl_Gnrc_D, opts_Gnrc, cnts_Gnrc }  // Gnrc
};


// ===================================================================
// EXTERNAL LINKS
// ===================================================================
extern BluetoothManager btManager;
extern void sendEffectChangeToDSP(uint8_t idx, uint8_t en, const uint8_t* k, const uint8_t* d);
extern void sendToDSP(const char cmd[4], uint8_t* payload, size_t len);
extern void updateDSPFromPreset();
extern bool loadPreset(uint8_t bank, uint8_t number, Preset& preset);
extern size_t serializeStructToBlob(const Preset& p, uint8_t* buf);
extern uint8_t blobBuffer[]; 

// ===================================================================
// STATIC DATA
// ===================================================================
const char* DisplayManager::presetNames[TOTAL_BANKS] = { "CLEAN", "CRUNCH", "OVERDRV","DISTORT", "MODUL", "CUSTM1", "CUSTM2" };

const char* DisplayManager::fxLabels[TOTAL_FX] = {
  "GATE", "COMP", "AWAH", "OVRD", "DIST", "EQUL", "HARM",
  "VIBR", "CHOR", "OCTV", "FLNG", "PHAS", "TREM", "FIR ",
  "DELY", "NAM ", "RVRB","GNRC"
};

const uint16_t DisplayManager::fxColors[7] = { 
    TFT_DARKGREEN, TFT_BROWN, TFT_PINK, TFT_DARKCYAN, TFT_MAROON, TFT_PURPLE, TFT_ORANGE 
};

const char* DisplayManager::extraLabels[TOTAL_EXTRA_BUTTONS] = { "Setup", "Looper", "Drum" };
const uint16_t DisplayManager::extraColors[TOTAL_EXTRA_BUTTONS] = { TFT_DARKGREY, TFT_DARKGREY, TFT_DARKGREY };

const GFXfont& DisplayManager::FONT_GENERAL_NORMAL = FreeSans9pt7b;
const GFXfont& DisplayManager::FONT_GENERAL_BOLD = FreeSansBold9pt7b;
const GFXfont& DisplayManager::FONT_PRESET_TITLE_NORMAL = FreeSans18pt7b;
const GFXfont& DisplayManager::FONT_LOOPER_BIG = FreeSansBold24pt7b;

// ===================================================================
// ENHANCED BUTTON
// ===================================================================
class EnhancedRectButton : public RectButton {
public:
  EnhancedRectButton(int x, int y, int w, int h, int radius, uint16_t bg, uint16_t border, String label, RectButtonType type = RECT_BUTTON)
    : RectButton(x, y, w, h, radius, bg, border, label, type) {}

  void drawWithFont(TFT_eSPI& tft, const GFXfont* font) {
    int clearMargin = HIGHLIGHT_BORDER_THICKNESS; 
    
    tft.fillRoundRect(x - clearMargin, y - clearMargin, w + 2 * clearMargin, h + 2 * clearMargin, radius + clearMargin, TFT_BLACK);
    tft.fillRoundRect(x, y, w, h, radius, bgColor);

    if (type == RECT_PROGRESS) {
      int fillW = map(progressValue, 0, 255, 0, w);
      tft.fillRoundRect(x, y, fillW, h, radius, progressColor);
    }

    tft.setTextDatum(MC_DATUM);
    tft.setFreeFont(font);
    
    if (type == RECT_PROGRESS) tft.setTextColor(TFT_RED); 
    else tft.setTextColor(TFT_WHITE, bgColor);
    
    tft.drawString(label, x + w / 2, y + h / 2);

    if (highlighted) {
      for (int i = 0; i < HIGHLIGHT_BORDER_THICKNESS; ++i)
        tft.drawRoundRect(x - i, y - i, w + 2 * i, h + 2 * i, radius + i, TFT_RED);
    } else {
      tft.drawRoundRect(x, y, w, h, radius, borderColor);
    }
    
    if (type == RECT_SELECTION && selected) {
      tft.drawRoundRect(x + 2, y + 2, w - 4, h - 4, radius - 2, TFT_ORANGE);
    }
  }
};

// ===================================================================
// MANAGER IMPLEMENTATION
// ===================================================================

DisplayManager::DisplayManager() 
    : tft(), currentState(STATE_MAIN_MENU), currentRectIndex(0), lastEncoder1Pos(0), lastEncoder2Pos(0),
      currentPresetTypeIndex(0), currentPresetNumber(1),
      looperEnabled(false), drumEnabled(false),
      looperRectIndex(0), looperAdjusting(false), looperSelectorA(0), looperSelectorB(0),
      loopLevel(0), isRecording(false), loopStart(0), loopLength(0), lastStepTime(0), currentArcStep(0) {
      
    looperSlider[0] = 127; 
    looperSlider[1] = 127;

    // 1. Preset Bar
    mainMenuButtons[0] = new EnhancedRectButton(5, 0, 230, 50, 6, TFT_DARKCYAN, TFT_RED, "Preset", RECT_SELECTION);

    // 2. FX Grid
    const int FX_COLS = 4;
    const int FX_BUTTON_W = 55, FX_BUTTON_H = 28;
    const int FX_SPACING_X = 5, FX_SPACING_Y = 5;
    const int FX_START_X = 5, FX_START_Y = 55;

    for (int i = 0; i < TOTAL_FX; ++i) {
        int row = i / FX_COLS;
        int col = i % FX_COLS;
        int x = FX_START_X + col * (FX_BUTTON_W + FX_SPACING_X);
        int y = FX_START_Y + row * (FX_BUTTON_H + FX_SPACING_Y);
        mainMenuButtons[i + 1] = new EnhancedRectButton(x, y, FX_BUTTON_W, FX_BUTTON_H, 6, fxColors[i % 7], TFT_WHITE, fxLabels[i], RECT_BUTTON);
    }

    // 3. Extra Buttons
    const int EXTRA_START_Y = 230; 
    const int EXTRA_BUTTON_H = 28;
    for (int i = 0; i < TOTAL_EXTRA_BUTTONS; ++i) {
        int x = 5 + i * (73 + 5); 
        int y = EXTRA_START_Y;
        mainMenuButtons[i + 18] = new EnhancedRectButton(x, y, 73, EXTRA_BUTTON_H, 6, extraColors[i], TFT_WHITE, extraLabels[i], RECT_BUTTON);
    }

    // 4. Util Bars
    int barW = (SCREEN_WIDTH - 30) / 2;
    int barY = SCREEN_HEIGHT - 35;
    mainMenuButtons[21] = new EnhancedRectButton(10, barY, barW, 28, 5, TFT_BLACK, TFT_WHITE, "Vol", RECT_PROGRESS);
    mainMenuButtons[22] = new EnhancedRectButton(10 + barW + 10, barY, barW, 28, 5, TFT_BLACK, TFT_WHITE, "BPM", RECT_PROGRESS);
}

void DisplayManager::begin() {
    tft.init();
    tft.setRotation(2);
    tft.fillScreen(TFT_BLACK);
    refresh();
}

void DisplayManager::refresh() {
    currentPresetTypeIndex = currentPreset.bank;
    currentPresetNumber = currentPreset.number + 1;
    if(currentPresetTypeIndex >= TOTAL_BANKS) currentPresetTypeIndex = TOTAL_BANKS-1;
    
    volumeValue = currentPreset.masterVolume;
    bpmValue = currentPreset.bpm;
    for(int i=0; i<TOTAL_FX; i++) {
        fxEnabled[i] = currentPreset.effects[i].enabled;
    }
    
    if (currentState == STATE_MAIN_MENU) drawMainScreen();
}

// ===================================================================
// TUNER METHODS
// ===================================================================

void DisplayManager::toggleTuner(bool enable) {
    if (enable) {
        currentState = STATE_TUNER;
        currentFreq = 0;
        currentNote = "--";
        currentCents = 0;
        drawTunerScreen();
    } else {
        if (currentState == STATE_TUNER) {
            currentState = STATE_MAIN_MENU;
            drawMainScreen();
        }
    }
}

bool DisplayManager::isTunerActive() {
    return currentState == STATE_TUNER;
}

void DisplayManager::updateTuner(float freq) {
    if (currentState != STATE_TUNER) return;
    
    // Limit refresh rate to ~20ms to prevent flicker
    if (millis() - lastTunerUpdate < 20) return;
    
    calculatePitch(freq);
    drawTunerScreen();
    lastTunerUpdate = millis();
}

void DisplayManager::calculatePitch(float freq) {
    currentFreq = freq;
    
    if (freq < 20.0f) {
        currentNote = "--";
        currentCents = 0;
        return;
    }

    const char* noteStrings[] = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
    
    // Formula matches Web App (View.js)
    float noteNum = 12.0f * log2(freq / 440.0f) + 69.0f;
    int roundedNote = round(noteNum);
    float diff = noteNum - roundedNote;
    currentCents = (int)(diff * 100);
    
    int noteIndex = roundedNote % 12;
    if (noteIndex < 0) noteIndex += 12;
    
    currentNote = String(noteStrings[noteIndex]);
}

void DisplayManager::handleTunerMode() {
    // Exit Tuner on Long Press of Encoder 2 (Volume)
    // NOTE: This logic matches the call in controller_v2_aligned.ino, 
    // but we can also safety check here if needed.
    // The actual triggering happens in the main loop, so this function 
    // mostly just keeps the screen updated or handles other inputs if desired.
}

void DisplayManager::drawTunerScreen() {
    // 1. Clear Screen (or partial clear for performance)
    // For simplicity, full clear (or optimize later)
    tft.fillScreen(TFT_BLACK);

    // 2. Title
    tft.setTextDatum(TC_DATUM);
    tft.setTextColor(TFT_DARKGREY, TFT_BLACK);
    tft.setFreeFont(&FONT_GENERAL_BOLD);
    tft.drawString("TUNER", SCREEN_WIDTH / 2, 10);

    // 3. Note Name (Big Center)
    tft.setTextDatum(MC_DATUM);
    tft.setFreeFont(&FONT_LOOPER_BIG); // Use biggest font available
    
    uint16_t noteColor = (abs(currentCents) < 5 && currentFreq > 20) ? TFT_GREEN : TFT_WHITE;
    tft.setTextColor(noteColor, TFT_BLACK);
    tft.drawString(currentNote, SCREEN_WIDTH / 2, 100);

    // 4. Frequency Text
    tft.setFreeFont(&FONT_GENERAL_NORMAL);
    tft.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
    String freqStr = (currentFreq > 20) ? String(currentFreq, 1) + " Hz" : "-- Hz";
    tft.drawString(freqStr, SCREEN_WIDTH / 2, 160);

    // 5. Cents / Needle Bar
    // Draw a bar from -50 to +50 cents
    int barX = 20;
    int barY = 220;
    int barW = SCREEN_WIDTH - 40;
    int barH = 20;
    int centerX = barX + barW / 2;

    // Background Line
    tft.drawRect(barX, barY, barW, barH, TFT_DARKGREY);
    tft.drawLine(centerX, barY - 5, centerX, barY + barH + 5, TFT_WHITE); // Center Marker

    if (currentFreq > 20) {
        // Map Cents (-50 to 50) to X position
        int needleX = map(currentCents, -50, 50, barX, barX + barW);
        needleX = constrain(needleX, barX, barX + barW);
        
        // Draw Needle (Circle or Line)
        uint16_t needleColor = (abs(currentCents) < 5) ? TFT_GREEN : TFT_RED;
        tft.fillCircle(needleX, barY + barH / 2, 8, needleColor);
        
        // Cents Text
        tft.drawString(String(currentCents) + " cents", SCREEN_WIDTH / 2, 260);
    }
}

void DisplayManager::checkExternalChanges() {
    if (currentState != STATE_MAIN_MENU) return; 

    if (currentPreset.masterVolume != volumeValue) {
        volumeValue = currentPreset.masterVolume;
        highlightRect(21, (currentRectIndex == 21));
    }
    if (currentPreset.bpm != bpmValue) {
        bpmValue = currentPreset.bpm;
        highlightRect(22, (currentRectIndex == 22));
    }
    for (int i = 0; i < TOTAL_FX; ++i) {
        if (currentPreset.effects[i].enabled != fxEnabled[i]) {
            fxEnabled[i] = currentPreset.effects[i].enabled;
            highlightRect(i + 1, (currentRectIndex == i + 1));
        }
    }
    int targetNum = currentPreset.number + 1;
    if (currentPreset.bank != currentPresetTypeIndex || targetNum != currentPresetNumber) {
        refresh();
    }
}

void DisplayManager::loop() {
    switch (currentState) {
        case STATE_MAIN_MENU: handleMainMenu(); break;
        case STATE_LOOPER:    handleLooperMode(); break;
        case STATE_TUNER:     handleTunerMode(); break; // <--- ADDED
        case STATE_FX_EDIT:   handleFxEditMode(); break;
    }
}


// ===================================================================
// STATE: FX EDIT MODE
// ===================================================================

void DisplayManager::handleFxEditMode() {
    // 1. Exit Logic (Long Click)
    if (encoder1.isLongClick()) {
        currentState = STATE_MAIN_MENU;
        encoder1.setPosition(fxEditIndex + 1); 
        lastEncoder1Pos = fxEditIndex + 1;
        drawMainScreen();
        return;
    }

    const FxLayout& layout = fxLayouts[fxEditIndex];
    int totalParams = layout.knobCount + layout.dropCount;

    // 2. Navigation Mode
    if (!fxParamAdjusting) {
        int newPos = encoder1.getPosition();
        if (newPos != lastEncoder1Pos) {
            
            // Capture OLD index before updating
            int oldParamIndex = fxParamIndex;

            int delta = (newPos > lastEncoder1Pos) ? 1 : -1;
            fxParamIndex += delta;
            
            if (fxParamIndex < 0) fxParamIndex = totalParams - 1;
            if (fxParamIndex >= totalParams) fxParamIndex = 0;
            
            lastEncoder1Pos = newPos;

            // Call with Partial Flag and Old Index
            drawFxEditScreen(false, oldParamIndex); 
        }

        if (encoder1.isButtonPressed()) {
            fxParamAdjusting = true;
            int currentVal = 0;
            if (fxParamIndex < layout.knobCount) {
                currentVal = currentPreset.effects[fxEditIndex].knobs[fxParamIndex];
            } else {
                int dropIdx = fxParamIndex - layout.knobCount;
                currentVal = currentPreset.effects[fxEditIndex].dropdowns[dropIdx];
            }
            encoder1.setPosition(currentVal);
            lastEncoder1Pos = currentVal;
            drawFxEditScreen(); // Full redraw to change border color
        }
    } 
    // 3. Adjust Mode (OPTIMIZED)
    else {
        int newPos = encoder1.getPosition();
        if (newPos != lastEncoder1Pos) {
            int val = newPos;
            
            // --- UPDATED CLAMPING LOGIC ---
            if (fxParamIndex < layout.knobCount) {
                // Knob: 0 - 100
                if (val < 0) { val = 0; encoder1.setPosition(0); }
                if (val > 100) { val = 100; encoder1.setPosition(100); }
            } else {
                // Dropdown: 0 - (Count-1)
                int dropIdx = fxParamIndex - layout.knobCount;
                int maxVal = 0;
                
                // Safety check for null pointers
                if (layout.dropOptionCounts) {
                    maxVal = layout.dropOptionCounts[dropIdx] - 1;
                }
                
                if (val < 0) { val = 0; encoder1.setPosition(0); }
                if (val > maxVal) { val = maxVal; encoder1.setPosition(maxVal); }
            }
            
            // Update Data & Send to DSP...
            if (fxParamIndex < layout.knobCount) {
                currentPreset.effects[fxEditIndex].knobs[fxParamIndex] = val;
                uint8_t packet[3] = { (uint8_t)fxEditIndex, (uint8_t)fxParamIndex, (uint8_t)val };
                uint8_t bleP[4] = { 0x20, packet[0], packet[1], packet[2] };
                btManager.sendBLEData(bleP, 4);

                // *** OPTIMIZED DRAW ***
                const char* label = layout.knobLabels[fxParamIndex];
                drawFxParamSlider(fxParamIndex, label, val, true, true, true); // true=partial

            } else {
                int dropIdx = fxParamIndex - layout.knobCount;
                currentPreset.effects[fxEditIndex].dropdowns[dropIdx] = val;
                uint8_t pid = layout.knobCount + dropIdx;
                uint8_t packet[3] = { (uint8_t)fxEditIndex, (uint8_t)pid, (uint8_t)val };
                uint8_t bleP[4] = { 0x20, packet[0], packet[1], packet[2] };
                btManager.sendBLEData(bleP, 4);

                // *** OPTIMIZED DRAW ***
                const char* label = layout.dropLabels[dropIdx];
                // Note: We pass the global param index 'fxParamIndex' to the draw function
                // so it can calculate row/col correctly.
                drawFxParamDropdown(fxParamIndex, label, val, true, true, true); // true=partial
            }
            
            // Throttle DSP updates if needed, but robust protocol handles it well
            sendEffectChangeToDSP(fxEditIndex, currentPreset.effects[fxEditIndex].enabled,
                                  currentPreset.effects[fxEditIndex].knobs,
                                  currentPreset.effects[fxEditIndex].dropdowns);

            lastEncoder1Pos = val;
            // DO NOT CALL drawFxEditScreen() here!
        }

        if (encoder1.isButtonPressed()) {
            fxParamAdjusting = false;
            encoder1.setPosition(fxParamIndex); 
            lastEncoder1Pos = fxParamIndex;
            drawFxEditScreen(); // Full redraw to restore navigation border
        }
    }
}

void DisplayManager::drawFxEditScreen(bool fullRedraw, int prevParamIndex) {
    const FxLayout& layout = fxLayouts[fxEditIndex];
    int totalParams = layout.knobCount + layout.dropCount;

    // --- 1. Calculate Scroll Offsets ---
    int rowHeight = 45;
    
    // Current Scroll
    int curRow = fxParamIndex / 2;
    int curOffset = (curRow > 4) ? (curRow - 4) * rowHeight : 0;

    // Previous Scroll (if valid)
    int prevOffset = -1;
    if (prevParamIndex != -1) {
        int prevRow = prevParamIndex / 2;
        prevOffset = (prevRow > 4) ? (prevRow - 4) * rowHeight : 0;
    }

    // --- 2. Check Redraw Strategy ---
    // If offsets match, we didn't scroll -> Partial Redraw
    if (!fullRedraw && prevParamIndex != -1 && curOffset == prevOffset) {
        
        // A. Redraw PREVIOUS item (Unselect it)
        if (prevParamIndex < layout.knobCount) {
             drawFxParamSlider(prevParamIndex, layout.knobLabels[prevParamIndex], 
                               currentPreset.effects[fxEditIndex].knobs[prevParamIndex], 
                               false, false, false); // partial=false (draw border+label), but optimized internal logic handles bar
        } else {
             int dIdx = prevParamIndex - layout.knobCount;
             drawFxParamDropdown(prevParamIndex, layout.dropLabels[dIdx], 
                                 currentPreset.effects[fxEditIndex].dropdowns[dIdx], 
                                 false, false, false);
        }

        // B. Redraw NEW item (Select it)
        if (fxParamIndex < layout.knobCount) {
             drawFxParamSlider(fxParamIndex, layout.knobLabels[fxParamIndex], 
                               currentPreset.effects[fxEditIndex].knobs[fxParamIndex], 
                               true, false, false);
        } else {
             int dIdx = fxParamIndex - layout.knobCount;
             drawFxParamDropdown(fxParamIndex, layout.dropLabels[dIdx], 
                                 currentPreset.effects[fxEditIndex].dropdowns[dIdx], 
                                 true, false, false);
        }
        return; // Done!
    }

    // --- 3. FULL REDRAW (Fallback) ---
    // If we scrolled OR forced full redraw
    
    tft.fillScreen(TFT_BLACK);

    // Header
    tft.fillRect(0, 0, SCREEN_WIDTH, 40, fxColors[fxEditIndex % 7]);
    tft.setTextDatum(MC_DATUM);
    tft.setFreeFont(&FONT_GENERAL_BOLD);
    tft.setTextColor(TFT_WHITE, fxColors[fxEditIndex % 7]);
    String title = String(fxLabels[fxEditIndex]) + (fxParamAdjusting ? " *" : "");
    tft.drawString(title, SCREEN_WIDTH / 2, 20);

    // Draw All Visible Items
    int startY = 50;
    int colWidth = SCREEN_WIDTH / 2;

    for (int i = 0; i < totalParams; i++) {
        int row = i / 2;
        int col = i % 2;
        
        int x = col * colWidth;
        int y = startY + row * rowHeight - curOffset; // Use Calculated Offset

        // Culling: Don't draw off-screen items
        if (y < 40 || y > SCREEN_HEIGHT - 10) continue;

        bool isSelected = (i == fxParamIndex);
        
        if (i < layout.knobCount) {
            drawFxParamSlider(i, layout.knobLabels[i], currentPreset.effects[fxEditIndex].knobs[i], isSelected, fxParamAdjusting, false);
        } else {
            int dropIdx = i - layout.knobCount;
            drawFxParamDropdown(i, layout.dropLabels[dropIdx], currentPreset.effects[fxEditIndex].dropdowns[dropIdx], isSelected, fxParamAdjusting, false);
        }
    }
}

void DisplayManager::drawFxParamSlider(int index, const char* label, uint8_t value, bool selected, bool adjusting, bool partialUpdate) {
    int row = index / 2;
    int col = index % 2;
    int x = 5 + col * 120;
    
    // Calculate Y based on scroll logic
    int rowHeight = 45;
    int startY = 50;
    int selectedRow = fxParamIndex / 2;
    int offset = 0;
    if (selectedRow > 4) offset = (selectedRow - 4) * rowHeight;
    int y = startY + row * rowHeight - offset;

    // --- FULL DRAW ONLY ---
    if (!partialUpdate) {
        // Draw Border
        uint16_t borderColor = selected ? (adjusting ? TFT_RED : TFT_ORANGE) : TFT_DARKGREY;
        tft.drawRoundRect(x, y, 110, 40, 4, borderColor);

        // Draw Label
        tft.setTextDatum(TL_DATUM);
        tft.setFreeFont(&FONT_GENERAL_NORMAL);
        tft.setTextColor(selected ? TFT_WHITE : TFT_LIGHTGREY, TFT_BLACK);
        tft.drawString(label, x + 5, y + 2);
    }

    // --- DYNAMIC UPDATE (Bar & Value) ---
    int barX = x + 5;
    int barY = y + 22;
    int barW = 100;
    int barH = 12;
    
    // 1. Clear the bar area (overwrite with Grey background)
    // This removes the "old" green bar without clearing the whole screen
    tft.fillRect(barX, barY, barW, barH, TFT_DARKGREY);

    // 2. Draw new Fill
    int fillW = map(value, 0, 100, 0, barW);
    if (fillW > 0) {
        tft.fillRect(barX + 1, barY + 1, fillW - 2, barH - 2, TFT_GREEN);
    }
    
    // 3. Update Text Value
    // We assume the text is to the right or overlaid. 
    // Let's clear a small box for the text to prevent overwrite artifacts.
    tft.setTextDatum(MR_DATUM);
    tft.setTextColor(TFT_WHITE, TFT_BLACK); // Or transparent if over grey?
    
    // Clear previous text area (approximate location)
    // We draw text at x+105. Let's clear from x+80 to x+110
    // Note: If text is INSIDE the bar, skip this. 
    // If text is ABOVE, use a small fillRect.
    // Based on previous code, text was at y+10. 
    // Let's just redraw it with background color to be safe.
    tft.setTextColor(TFT_WHITE, TFT_BLACK);
    // Clearing text area specifically is tricky without flickering, 
    // but since we usually draw text on the black background above the bar:
    tft.fillRect(x + 75, y + 2, 30, 18, TFT_BLACK); // Clear old number
    tft.drawString(String(value), x + 105, y + 10);
}

void DisplayManager::drawFxParamDropdown(int index, const char* label, uint8_t value, bool selected, bool adjusting, bool partialUpdate) {
    int row = index / 2;
    int col = index % 2;
    int x = 5 + col * 120;
    
    // Calculate Y based on scroll logic
    int rowHeight = 45;
    int startY = 50;
    int selectedRow = fxParamIndex / 2;
    int offset = 0;
    if (selectedRow > 4) offset = (selectedRow - 4) * rowHeight;
    int y = startY + row * rowHeight - offset;

    // --- FULL DRAW ONLY ---
    if (!partialUpdate) {
        uint16_t borderColor = selected ? (adjusting ? TFT_MAGENTA : TFT_ORANGE) : TFT_DARKGREY;
        tft.drawRoundRect(x, y, 110, 40, 4, borderColor);

        // Label
        tft.setTextDatum(TL_DATUM);
        tft.setFreeFont(&FONT_GENERAL_NORMAL);
        tft.setTextColor(selected ? TFT_WHITE : TFT_LIGHTGREY, TFT_BLACK);
        tft.drawString(label, x + 5, y + 2);
    }

    // --- DYNAMIC UPDATE (Value Box) ---
    // Clear the value box area
    // 1. Clear Box
    tft.fillRect(x + 5, y + 20, 100, 16, TFT_DARKGREY);
    
    // 2. Get String
    String dispText = String(value); // Default to number
    const FxLayout& layout = fxLayouts[fxEditIndex];
    int dropIdx = index - layout.knobCount;
    
    // Lookup string if available
    if (layout.dropOptions && layout.dropOptionCounts) {
        if (value < layout.dropOptionCounts[dropIdx]) {
            dispText = String(layout.dropOptions[dropIdx][value]);
        }
    }

    // 3. Draw Text
    tft.setTextDatum(MC_DATUM);
    tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
    tft.drawString(dispText, x + 55, y + 28);
}

// ===================================================================
// STATE: MAIN MENU
// ===================================================================
void DisplayManager::handleMainMenu() {
    checkExternalChanges();

    // 1. Navigation
    int newPos1 = encoder1.getPosition();
    if (newPos1 != lastEncoder1Pos) {
        int oldIndex = currentRectIndex;
        if (newPos1 > lastEncoder1Pos) currentRectIndex++;
        else currentRectIndex--;
        
        if (currentRectIndex < 0) currentRectIndex = TOTAL_MAIN_MENU_RECTS - 1;
        if (currentRectIndex >= TOTAL_MAIN_MENU_RECTS) currentRectIndex = 0;
        
        if (oldIndex != currentRectIndex) {
            highlightRect(oldIndex, false);
            highlightRect(currentRectIndex, true);
        }
        lastEncoder1Pos = newPos1;
    }

    // 2. Encoder 1 Actions
    if (encoder1.isButtonPressed()) {
        if (currentRectIndex >= 1 && currentRectIndex <= TOTAL_FX) {
            // Toggle Effect
            int fxIdx = currentRectIndex - 1;
            bool newState = !currentPreset.effects[fxIdx].enabled;
            currentPreset.effects[fxIdx].enabled = newState;
            fxEnabled[fxIdx] = newState;
            
            sendEffectChangeToDSP(fxIdx, newState, currentPreset.effects[fxIdx].knobs, currentPreset.effects[fxIdx].dropdowns);
            uint8_t packet[2] = { (uint8_t)fxIdx, (uint8_t)(newState ? 1 : 0) };
            btManager.sendBLEData(packet, 2); 
            highlightRect(currentRectIndex, true); 
        } 
        else if (currentRectIndex == 19) { 
            // ENTER LOOPER MODE
            currentState = STATE_LOOPER;
            looperRectIndex = 0;
            looperAdjusting = false;
            encoder1.setPosition(0);
            lastEncoder1Pos = 0;
            drawLooperScreen();
            return;
        }
    }

    if (encoder1.isLongClick()) {
        if (currentRectIndex >= 1 && currentRectIndex <= TOTAL_FX) {
            // ENTER FX EDIT MODE
            currentState = STATE_FX_EDIT;
            fxEditIndex = currentRectIndex - 1; // 0-based index
            fxParamIndex = 0;
            fxParamAdjusting = false;
            
            // Reset Encoder
            encoder1.setPosition(0); 
            lastEncoder1Pos = 0;
            
            drawFxEditScreen(true);
            return;
        }
    }

    // 3. Encoder 2 Actions (Volume Only)
    int newPos2 = encoder2.getPosition();
    if (newPos2 != lastEncoder2Pos) {
        int delta = newPos2 - lastEncoder2Pos;
        int newVal = currentPreset.masterVolume + (delta * 5);
        if (newVal > 100) newVal = 100;
        if (newVal < 0) newVal = 0;
        setVolume((uint8_t)newVal);
        lastEncoder2Pos = newPos2;
    }

    // 4. SWITCH ACTIONS (Preset Control)
    if (switch1.isButtonPressed()) {
        currentPresetNumber++;
        if (currentPresetNumber > 5) currentPresetNumber = 1;
        
        if (loadPreset(currentPresetTypeIndex, currentPresetNumber - 1, currentPreset)) {
            currentPreset.bank = currentPresetTypeIndex;
            currentPreset.number = currentPresetNumber - 1;
            updateDSPFromPreset();
            refresh();
        }
    }
    
    if (switch2.isButtonPressed()) {
        currentPresetTypeIndex++;
        if (currentPresetTypeIndex > 6) currentPresetTypeIndex = 0;
        currentPresetNumber = 1; 
        if (loadPreset(currentPresetTypeIndex, 0, currentPreset)) {
            currentPreset.bank = currentPresetTypeIndex;
            currentPreset.number = 0;
            updateDSPFromPreset();
            refresh();
        }
    }
}

// ===================================================================
// STATE: LOOPER MODE
// ===================================================================
void DisplayManager::handleLooperMode() {
    updateLooperVisuals();

    // 1. EXIT: Long Click
    if (encoder1.isLongClick()) {
        currentState = STATE_MAIN_MENU;
        encoder1.setPosition(currentRectIndex); 
        drawMainScreen();
        return;
    }

    // 2. Navigation & Adjust
    int newPos = encoder1.getPosition();
    bool click = encoder1.isButtonPressed();

    if (!looperAdjusting) {
        if (newPos != lastEncoder1Pos) {
            looperRectIndex += (newPos > lastEncoder1Pos) ? 1 : -1;
            if (looperRectIndex < 0) looperRectIndex = 3;
            if (looperRectIndex > 3) looperRectIndex = 0;
            drawLooperScreen(); 
            lastEncoder1Pos = newPos;
        }
        if (click) {
            looperAdjusting = true;
            int val = 0;
            if (looperRectIndex == 0) val = looperSelectorA;
            else if (looperRectIndex == 1) val = looperSelectorB;
            else val = looperSlider[looperRectIndex - 2];
            encoder1.setPosition(val);
            lastEncoder1Pos = val;
            drawLooperScreen(); 
        }
    } else {
        if (newPos != lastEncoder1Pos) {
            if (looperRectIndex == 0) looperSelectorA = (newPos % 2 + 2) % 2; 
            else if (looperRectIndex == 1) looperSelectorB = (newPos % 4 + 4) % 4; 
            else {
                int val = newPos;
                if (val > 100) val = 100; 
                if (val < 0) val = 0;
                looperSlider[looperRectIndex - 2] = val;
            }
            lastEncoder1Pos = newPos;
            drawLooperScreen(); 
        }
        if (click) {
            looperAdjusting = false;
            encoder1.setPosition(looperRectIndex);
            lastEncoder1Pos = looperRectIndex;
            drawLooperScreen(); 
        }
    }

    // 3. LOOPER CONTROLS (Switches)
    if (switch1.isButtonPressed()) {
        if (!isRecording && loopLevel == 0) {
            loopStart = millis();
            isRecording = true;
            currentArcStep = 0;
            lastStepTime = millis();
        } else if (isRecording && loopLevel == 0) {
            loopLength = millis() - loopStart;
            loopLength = (loopLength / 16) * 16;
            isRecording = false;
            loopLevel = 1;
            currentArcStep = 0;
            lastStepTime = millis();
        } else if (!isRecording) {
            isRecording = true;
        } else {
            isRecording = false;
            loopLevel++;
        }
        drawLooperScreen(); 
        // Forward to DSP here if needed
    }

    if (switch2.isButtonPressed()) {
        if (loopLevel > 0) loopLevel--;
        if (loopLevel == 0) {
            loopLength = 0;
            isRecording = false;
            currentArcStep = 0;
            lastStepTime = 0;
        }
        drawLooperScreen();
    }
}

void DisplayManager::updateLooperVisuals() {
    if (!isRecording && loopLevel == 0) return;
    unsigned long now = millis();
    unsigned long stepDur = (loopLength > 0) ? (loopLength / 16) : 125;
    
    if (now - lastStepTime >= stepDur) {
        currentArcStep = (currentArcStep + 1) % 16;
        uint16_t color = isRecording ? TFT_RED : TFT_GREEN;
        drawLooperArc(currentArcStep, color);
        lastStepTime = now;
    }
}

void DisplayManager::drawLooperScreen() {
    static const char* modeOpts[] = { "Once", "Loop" };
    static const char* quantOpts[] = { "1/16", "1/8", "1/4", "1/2" };
    
    tft.fillScreen(TFT_BLACK);
    
    drawLooperSelector(0, "Mode", modeOpts, 2, looperSelectorA);
    drawLooperSelector(1, "Quant", quantOpts, 4, looperSelectorB);
    drawLooperSlider(2, "Input", looperSlider[0]);
    drawLooperSlider(3, "Feedback", looperSlider[1]);
    
    for(int i=0; i<4; i++) {
        int r = i/2; int c = i%2;
        int bx = 10 + c*120;
        int by = (i<2) ? 20 : 80;
        uint16_t color = (i == looperRectIndex) ? (looperAdjusting ? TFT_MAGENTA : TFT_RED) : TFT_BLACK;
        for(int k=0; k<3; k++) tft.drawRoundRect(bx-k, by-k, 110+k*2, 45+k*2, 6+k, color);
    }
    
    if (loopLevel > 0 || isRecording) {
        tft.setTextDatum(MC_DATUM);
        tft.setTextColor(TFT_WHITE, TFT_BLACK);
        tft.setFreeFont(&FONT_LOOPER_BIG);
        tft.drawString(String(loopLevel), 120, 225);
    }
}

void DisplayManager::drawLooperSelector(int idx, const char* label, const char* options[], int optCount, int value) {
  int x = 10 + (idx % 2) * 120;
  int y = 20;
  int w = 110, h = 45;
  tft.fillRoundRect(x, y, w, h, 6, TFT_BLUE);
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(TFT_WHITE, TFT_BLUE);
  tft.setFreeFont(&FONT_GENERAL_NORMAL);
  tft.drawString(label, x + 6, y + 6);
  tft.setTextDatum(BR_DATUM);
  tft.drawString(options[value], x + w - 6, y + h - 6);
}

void DisplayManager::drawLooperSlider(int idx, const char* label, int value) {
  int x = 10 + (idx % 2) * 120;
  int y = 80;
  int w = 110, h = 45;
  int fillW = map(value, 0, 255, 0, w);
  tft.fillRoundRect(x, y, w, h, 6, TFT_DARKGREY);
  tft.fillRoundRect(x, y, fillW, h, 6, TFT_GREEN);
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  tft.setFreeFont(&FONT_GENERAL_NORMAL);
  tft.drawString(label, x + 6, y + 6);
  tft.setTextDatum(BR_DATUM);
  tft.drawString(String(value), x + w - 6, y + h - 6);
}

/*void DisplayManager::drawLooperArc(int step, uint16_t color) {
  int centerX = 120;
  int centerY = 225;
  int r = 80;
  int thickness = 12;
  float start = step * 22.5;
  float end = start + 20.0;
  tft.drawArc(centerX, centerY, r, r - thickness, start, end, color, TFT_BLACK);
  
  int prev = (step == 0) ? 15 : step - 1;
  float p_start = prev * 22.5;
  float p_end = p_start + 20.0;
  tft.drawArc(centerX, centerY, r, r - thickness, p_start, p_end, TFT_BLACK, TFT_BLACK);
}*/
void DisplayManager::drawLooperArc(int step, uint16_t color) {
  int centerX = 120;
  int centerY = 225;
  int r = 80;
  int thickness = 12;

  // Calculate angles: 360 degrees / 16 steps = 22.5 degrees per step
  // We draw from 0 up to the current step (Progress Bar style)
  float startAngle = 0;
  float endAngle = (step + 1) * 22.5; 

  // 1. Clear the entire ring area first
  // This is necessary so that if the color changes (Red -> Green), 
  // the whole bar updates instantly, and it clears artifacts when looping back to 0.
  tft.drawArc(centerX, centerY, r, r - thickness, 0, 360, TFT_BLACK, TFT_BLACK);

  // 2. Draw the progress arc
  if (endAngle > 0) {
    tft.drawArc(centerX, centerY, r, r - thickness, startAngle, endAngle, color, TFT_BLACK);
  }
}

// ... [Common methods] ...
void DisplayManager::setVolume(uint8_t vol) {
    currentPreset.masterVolume = vol;
    volumeValue = vol; 
    uint8_t dspPayload[4] = { vol, 0, currentPreset.bpm, 0 };
    sendToDSP("GEN ", dspPayload, 4);
    uint8_t blePacket[5] = { 0x25, vol, 0, currentPreset.bpm, 0 };
    btManager.sendBLEData(blePacket, 5);
    highlightRect(21, (currentRectIndex == 21)); 
}

void DisplayManager::drawMainScreen() {
    tft.fillScreen(TFT_BLACK);
    for (int i = 0; i < TOTAL_MAIN_MENU_RECTS; ++i) {
        highlightRect(i, (i == currentRectIndex));
    }
}

void DisplayManager::highlightRect(int index, bool highlight) {
    RectButton* b = mainMenuButtons[index];
    b->highlighted = highlight;

    if (index == 0) {
        b->label = String(presetNames[currentPresetTypeIndex]) + "-" + String(currentPresetNumber);
        drawPresetInfo(); 
        return;
    } 
    else if (index >= 1 && index <= TOTAL_FX) {
        bool isEnabled = currentPreset.effects[index - 1].enabled;
        b->bgColor = isEnabled ? fxColors[(index - 1) % 7] : TFT_BLACK;
        static_cast<EnhancedRectButton*>(b)->drawWithFont(tft, &FONT_GENERAL_BOLD);
    } 
    else if (index >= 18 && index <= 20) {
        if (index == 19) b->bgColor = looperEnabled ? TFT_DARKGREEN : extraColors[index - 18];
        else if (index == 20) b->bgColor = drumEnabled ? TFT_DARKGREEN : extraColors[index - 18];
        else b->bgColor = extraColors[index - 18]; 
        static_cast<EnhancedRectButton*>(b)->drawWithFont(tft, &FONT_GENERAL_NORMAL);
    } 
    else if (index == 21) {
        b->progressValue = volumeValue; 
        b->label = "Vol: " + String(volumeValue);
        static_cast<EnhancedRectButton*>(b)->drawWithFont(tft, &FONT_GENERAL_NORMAL);
    } 
    else if (index == 22) {
        b->progressValue = bpmValue;
        b->label = "BPM: " + String(bpmValue);
        static_cast<EnhancedRectButton*>(b)->drawWithFont(tft, &FONT_GENERAL_NORMAL);
    }
}

void DisplayManager::drawPresetInfo() {
    int x = 5, y = 0, w = SCREEN_WIDTH - 10, h = 50;
    uint16_t bgColor = TFT_DARKCYAN;
    int clearMargin = HIGHLIGHT_BORDER_THICKNESS;
    tft.fillRect(x - clearMargin, y - clearMargin, w + 2 * clearMargin, h + 2 * clearMargin, TFT_BLACK);
    tft.fillRect(x, y, w, h, bgColor);
    tft.setTextDatum(MC_DATUM);
    tft.setFreeFont(&FONT_PRESET_TITLE_NORMAL);
    tft.setTextColor(TFT_WHITE, bgColor);
    String label = String(presetNames[currentPresetTypeIndex]) + "-" + String(currentPresetNumber);
    tft.drawString(label, SCREEN_WIDTH / 2, h / 2);

    if (currentRectIndex == 0) {
        for (int i = 0; i < HIGHLIGHT_BORDER_THICKNESS; ++i)
            tft.drawRect(x - i, y - i, w + 2 * i, h + 2 * i, TFT_RED);
    } else {
        tft.drawRect(x, y, w, h, TFT_WHITE);
    }
}