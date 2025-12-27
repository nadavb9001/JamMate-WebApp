#pragma once
#include <TFT_eSPI.h>
#include <TJpg_Decoder.h>
#include <Arduino.h>
#include "MyRotaryEncoder.h"
#include "PresetBinary_v2.hpp" 

// --- External Hardware & State ---
extern RotaryEncoder encoder1; // Main Navigation
extern RotaryEncoder encoder2; // Preset Control / Volume
extern PushSwitch switch1;     // Preset Up / Loop Rec
extern PushSwitch switch2;     // Preset Bank / Loop Stop
extern Preset currentPreset;   // Reference to global preset

// --- UI Constants ---
constexpr int SCREEN_WIDTH = 240;
constexpr int SCREEN_HEIGHT = 320;
constexpr int TOTAL_FX = 18; 
constexpr int TOTAL_EXTRA_BUTTONS = 3; 
constexpr int TOTAL_MAIN_MENU_RECTS = 24; 
constexpr int HIGHLIGHT_BORDER_THICKNESS = 3;
constexpr int TOTAL_BANKS = 7;

// --- Button Types ---
enum RectButtonType { RECT_BUTTON, RECT_SELECTION, RECT_PROGRESS };

// --- Display States ---
enum DisplayState {
    STATE_MAIN_MENU,
    STATE_LOOPER,
    STATE_TUNER,
    STATE_FX_EDIT // <--- ADDED
};

// --- Base Button Class ---
class RectButton {
public:
    int x, y, w, h, radius;
    uint16_t bgColor, borderColor, progressColor;
    String label;
    RectButtonType type;
    uint8_t progressValue;
    bool selected, enabled, highlighted;

    RectButton(int x, int y, int w, int h, int radius, uint16_t bg, uint16_t border, String label, RectButtonType type = RECT_BUTTON)
        : x(x), y(y), w(w), h(h), radius(radius), bgColor(bg), borderColor(border), label(label), type(type),
          progressColor(TFT_GREEN), progressValue(0), selected(false), enabled(true), highlighted(false) {}

    virtual void draw(TFT_eSPI& tft) {}
};

// --- Helper Struct for FX Layout ---
struct FxLayout {
    uint8_t knobCount;
    const char** knobLabels;
    uint8_t dropCount;
    const char** dropLabels;
    const char*** dropOptions;      // <--- NEW: Pointer to array of string arrays
    const uint8_t* dropOptionCounts;// <--- NEW: Pointer to array of counts
};

// --- Manager Class ---
class DisplayManager {
public:
    DisplayManager();
    void begin();
    void loop();
    
    // Updates from UI to System
    void setVolume(uint8_t vol);
    void setBPM(uint8_t bpm);
    
    // Refresh UI from Global State
    void refresh(); 
    
    // Tuner Control
    void toggleTuner(bool enable);
    void updateTuner(float freq);
    bool isTunerActive();

    TFT_eSPI tft;
    
private:
    
    DisplayState currentState;
    
    // State
    int currentRectIndex;
    int lastEncoder1Pos;
    int lastEncoder2Pos;
    
    // Internal Cache
    int currentPresetTypeIndex;
    int currentPresetNumber;
    uint8_t volumeValue;
    uint8_t bpmValue;
    bool fxEnabled[TOTAL_FX];
    
    // Flags
    bool looperEnabled;
    bool drumEnabled;
    
    // --- Looper State ---
    int looperRectIndex;
    bool looperAdjusting;
    int looperSelectorA;
    int looperSelectorB;
    uint8_t looperSlider[2];
    int loopLevel;
    bool isRecording;
    unsigned long loopStart;
    unsigned long loopLength;
    unsigned long lastStepTime;
    int currentArcStep;

    // --- Tuner State ---
    float currentFreq;
    String currentNote;
    int currentCents;
    unsigned long lastTunerUpdate;

    // UI Elements
    RectButton* mainMenuButtons[TOTAL_MAIN_MENU_RECTS];

    // Resources
    static const char* presetNames[TOTAL_BANKS];
    static const char* fxLabels[TOTAL_FX];
    static const uint16_t fxColors[7];
    static const char* extraLabels[TOTAL_EXTRA_BUTTONS];
    static const uint16_t extraColors[TOTAL_EXTRA_BUTTONS];
    
    // Fonts
    static const GFXfont& FONT_GENERAL_NORMAL;
    static const GFXfont& FONT_GENERAL_BOLD;
    static const GFXfont& FONT_PRESET_TITLE_NORMAL;
    static const GFXfont& FONT_LOOPER_BIG;
    // You might want a larger font for the Note Name
    // static const GFXfont& FONT_TUNER_NOTE; 

    // --- FX Edit State ---
    int fxEditIndex;         // Which effect are we editing (0-17)
    int fxParamIndex;        // Which parameter is selected
    bool fxParamAdjusting;   // Are we currently changing the value?
    
    // Layout Data Definitions
    static const FxLayout fxLayouts[TOTAL_FX];

    // Helpers
    void handleFxEditMode();
    void drawFxEditScreen(bool fullRedraw = true, int prevParamIndex = -1);
    void drawFxParamSlider(int index, const char* label, uint8_t value, bool selected, bool adjusting, bool partialUpdate = false);
    void drawFxParamDropdown(int index, const char* label, uint8_t value, bool selected, bool adjusting, bool partialUpdate = false);

    // Helpers
    void drawMainScreen();
    void drawPresetInfo();
    void highlightRect(int index, bool highlight);
    void checkExternalChanges(); 
    
    // Looper Helpers
    void handleMainMenu();
    void handleLooperMode();
    void drawLooperScreen();
    void updateLooperVisuals();
    void drawLooperSelector(int idx, const char* label, const char* options[], int optCount, int value);
    void drawLooperSlider(int idx, const char* label, int value);
    void drawLooperArc(int step, uint16_t color);

    // Tuner Helpers
    void handleTunerMode();
    void drawTunerScreen();
    void calculatePitch(float freq);
};

extern DisplayManager display;