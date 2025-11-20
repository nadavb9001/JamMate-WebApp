// MyRotaryEncoder.h
/*
#ifndef MY_ROTARY_ENCODER_H
#define MY_ROTARY_ENCODER_H

#include <Arduino.h>  // For pinMode, digitalRead, millis etc.

class RotaryEncoder {
public:
  RotaryEncoder(int pinA, int pinB, int pinSw);
  void begin();
  void update();
  void setPosition(int position);
  void resetButton();
  int getPosition() const;
  bool isButtonPressed();
  bool isDoubleClick();  // Not fully implemented in the provided code
  bool isLongClick();
  int encoderPos;
  bool btnPressed;

  bool btnDown = false;
  bool doubleClick;
  bool longClick;
private:
  int pinA;
  int pinB;
  int pinSw;

  int lastStateA;
  int lastStateB;



  unsigned long lastDebounceTime;
  unsigned long debounceDelay;
  unsigned long buttonPressTime;
  unsigned long lastButtonPress;

  bool buttonState;
  bool lastButtonState;
  unsigned long btnPressTime = 0;
  unsigned long btnStartTime = 0;
  void calcEncoder();
  void checkButton();

  // In your class private section:
  uint8_t lastState;
  unsigned long lastEncoderTime;
};

class PushSwitch {
public:
  PushSwitch(int pinSw);
  void begin();
  void update();
  void resetButton();
  bool isButtonPressed();
  bool isDoubleClick();  // Not fully implemented in the provided code
  bool isLongClick();
  int pinSw;
  bool btnPressed;
private:




  unsigned long lastDebounceTime;
  unsigned long debounceDelay;
  unsigned long buttonPressTime;
  unsigned long lastButtonPress;
  bool btnDown = false;
  bool doubleClick;
  bool longClick;
  bool buttonState;
  bool lastButtonState;
  unsigned long btnPressTime = 0;
  unsigned long btnStartTime = 0;
  void checkButton();
};

#endif  // MY_ROTARY_ENCODER_H
*/


// MyRotaryEncoder.h

#ifndef MYROTARYENCODER_H
#define MYROTARYENCODER_H

#include <Arduino.h>

class RotaryEncoder {
public:
    RotaryEncoder(int pinA, int pinB, int pinSw);
    void begin();
    void update();
    void setPosition(int position);
    int getPosition() const;

    bool isButtonPressed();
    bool isDoubleClick();
    bool isLongClick();

    void resetButton();
    int encoderPos;
    bool btnPressed;
    bool doubleClick;
    bool longClick;

private:
    int pinA, pinB, pinSw;
    int stableState;                         // Last state that was accepted
    unsigned long stableSince;               // When the new state started appearing 
    int lastState,lastStateA,lastStateB;
    unsigned long lastEncoderDebounceTime;
    unsigned int encoderDebounceDelay; // ms

    // Button variables
    
    unsigned long btnPressTime;
    unsigned long lastButtonPress;
    unsigned long lastDebounceTime;
    static constexpr unsigned int debounceDelay = 50; // ms
    unsigned long buttonPressStart;
    int buttonState, lastButtonState;

    void calcEncoder();
    void checkButton();
};

class PushSwitch {
public:
  PushSwitch(int pinSw);
  void begin();
  void update();
  void resetButton();
  bool isButtonPressed();
  bool isDoubleClick();  // Not fully implemented in the provided code
  bool isLongClick();
  int pinSw;
  bool btnPressed;
private:




  unsigned long lastDebounceTime;
  unsigned long debounceDelay;
  unsigned long buttonPressTime;
  unsigned long lastButtonPress;
  bool btnDown = false;
  bool doubleClick;
  bool longClick;
  bool buttonState;
  bool lastButtonState;
  unsigned long btnPressTime = 0;
  unsigned long btnStartTime = 0;
  void checkButton();
};


#endif
