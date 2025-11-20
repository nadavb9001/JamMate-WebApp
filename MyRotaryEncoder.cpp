// MyRotaryEncoder.cpp

#include "MyRotaryEncoder.h"
/*
#include "MyRotaryEncoder.h"

// RotaryEncoder Class Implementation
RotaryEncoder::RotaryEncoder(int pinA, int pinB, int pinSw)
  : pinA(pinA), pinB(pinB), pinSw(pinSw), lastStateA(LOW), lastStateB(LOW),
    encoderPos(0), btnPressed(false), lastDebounceTime(0),
    debounceDelay(50), buttonPressTime(0), lastButtonPress(0),
    doubleClick(false), longClick(false), buttonState(HIGH), lastButtonState(HIGH) {
  pinMode(pinA, INPUT);
  pinMode(pinB, INPUT);
  pinMode(pinSw, INPUT);
 lastState = (digitalRead(pinA) << 1) | digitalRead(pinB);
lastEncoderTime = millis();

}

void RotaryEncoder::update() {
  calcEncoder();
  checkButton();
}

void RotaryEncoder::setPosition(int position) {
  encoderPos = position;
}

void RotaryEncoder::begin() {
  encoderPos = 0;
  pinMode(pinSw, INPUT_PULLUP);
  lastStateA = digitalRead(pinA);
  lastStateB = digitalRead(pinB);
  buttonState = digitalRead(pinSw);
  lastButtonState = buttonState;
}

int RotaryEncoder::getPosition() const {
  return encoderPos;
}

bool RotaryEncoder::isButtonPressed() {
  bool pressed = btnPressed;
  btnPressed = false;
  return pressed;
}

bool RotaryEncoder::isDoubleClick() {
  bool clicked = doubleClick;
  doubleClick = false;
  return clicked;
}

bool RotaryEncoder::isLongClick() {
  bool clicked = longClick;
  longClick = false;
  return clicked;
}

void RotaryEncoder::calcEncoder() {
  int stateA = digitalRead(pinA);
  int stateB = digitalRead(pinB);

  if (stateA != lastStateA) {
    if (stateA == HIGH) {
      if (stateB == LOW) {
        encoderPos++;
      } else {
        encoderPos--;
      }
    } else {
      if (stateB == HIGH) {
        encoderPos++;
      } else {
        encoderPos--;
      }
    }
  }
  lastStateA = stateA;
  lastStateB = stateB;
}




void RotaryEncoder::resetButton() {
  btnPressed = false;
  lastButtonState = LOW;
}

void RotaryEncoder::checkButton() {
  buttonState = digitalRead(pinSw);

  if (buttonState == HIGH && lastButtonState == LOW) {
    unsigned long currentReleaseTime = millis();
    if (currentReleaseTime - btnPressTime > debounceDelay) {
      btnPressed = true;
      longClick = (currentReleaseTime - btnPressTime > 800);
    }
  } else if (buttonState == LOW && lastButtonState == HIGH) {
    btnPressTime = millis();
    btnPressed = false;
    longClick = false;
  } else if (buttonState == HIGH && lastButtonState == HIGH) {
    btnPressed = false;
    longClick = false;
  }
  lastButtonState = buttonState;
}
*/
// PushSwitch Class Implementation
PushSwitch::PushSwitch(int pinSw)
  : pinSw(pinSw), btnPressed(false), lastDebounceTime(0),
    debounceDelay(50), buttonPressTime(0), lastButtonPress(0),
    doubleClick(false), longClick(false), buttonState(HIGH), lastButtonState(HIGH) {
  pinMode(pinSw, INPUT_PULLUP);
}

void PushSwitch::update() {
  checkButton();
}

void PushSwitch::begin() {
  // No specific initialization needed beyond constructor
}

bool PushSwitch::isButtonPressed() {
  bool pressed = btnPressed;
  btnPressed = false;
  return pressed;
}

bool PushSwitch::isDoubleClick() {
  bool clicked = doubleClick;
  doubleClick = false;
  return clicked;
}

bool PushSwitch::isLongClick() {
  bool clicked = longClick;
  longClick = false;
  return clicked;
}

void PushSwitch::resetButton() {
  btnPressed = false;
  lastButtonState = LOW;
}

void PushSwitch::checkButton() {
  buttonState = digitalRead(pinSw);

  if (buttonState == HIGH && lastButtonState == LOW && (millis() - btnPressTime) > 150) {
    btnStartTime = millis();
    longClick = (btnStartTime - btnPressTime > 600);
    btnPressed = true;
  } else if (buttonState == LOW && lastButtonState == HIGH) {
    btnPressTime = millis();
    btnPressed = false;
    longClick = false;
  } else {
    btnPressed = false;
    longClick = false;
  }
  lastButtonState = buttonState;
}



// MyRotaryEncoder.cpp



RotaryEncoder::RotaryEncoder(int pinA, int pinB, int pinSw)
  : pinA(pinA), pinB(pinB), pinSw(pinSw),
    encoderPos(0), lastState(0),
    lastEncoderDebounceTime(0),
    btnPressed(false), doubleClick(false), longClick(false),
    btnPressTime(0), lastButtonPress(0),
    lastDebounceTime(0), buttonPressStart(0),
    buttonState(HIGH), lastButtonState(HIGH) {
}

void RotaryEncoder::begin() {
  pinMode(pinA, INPUT_PULLUP);
  pinMode(pinB, INPUT_PULLUP);
  pinMode(pinSw, INPUT_PULLUP);
  int initialState = (digitalRead(pinA) << 1) | digitalRead(pinB);
  lastState = initialState;
  stableState = initialState;
  stableSince = millis();
  buttonState = digitalRead(pinSw);
  lastButtonState = buttonState;
}

void RotaryEncoder::update() {
  calcEncoder();
  checkButton();
}

void RotaryEncoder::setPosition(int position) {
  encoderPos = position;
}

int RotaryEncoder::getPosition() const {
  return encoderPos;
}

bool RotaryEncoder::isButtonPressed() {
  bool pressed = btnPressed;
  btnPressed = false;
  return pressed;
}

bool RotaryEncoder::isDoubleClick() {
  bool clicked = doubleClick;
  doubleClick = false;
  return clicked;
}

bool RotaryEncoder::isLongClick() {
  bool clicked = longClick;
  longClick = false;
  return clicked;
}

void RotaryEncoder::resetButton() {
  btnPressed = false;
  lastButtonState = LOW;
}
/*
void RotaryEncoder::calcEncoder() {
    int currA = digitalRead(pinA);
    int currB = digitalRead(pinB);
    int currState = (currA << 1) | currB;

    // Debounce: only process if current state has been stable long enough
    if (currState != stableState) {
        // State changed – record when
        stableSince = millis();
        stableState = currState;
        return;
    }

    // If state persisted more than encoderDebounceDelay, process it
    if (millis() - stableSince >= encoderDebounceDelay) {
        int transition = (lastState << 2) | currState;
        switch (transition) {
            case 0b0001:
            case 0b0111:
            case 0b1110:
            case 0b1000:
                encoderPos--;
                break;
            case 0b0010:
            case 0b0100:
            case 0b1101:
            case 0b1011:
                encoderPos++;
                break;
            // Ignore illegal transitions (noise/bounce)
        }
        lastState = currState;
    }
}
*/

/*void RotaryEncoder::calcEncoder() {
    int currA = digitalRead(pinA);
    int currB = digitalRead(pinB);
    int currState = (currA << 1) | currB;

    if (currState != lastState) {
        // Count when reaching EITHER detent state (11 OR 00)
        if ((currState == 0b11 && lastState != 0b11) || 
            (currState == 0b00 && lastState != 0b00)) {
            
            // Determine direction based on the transition pattern
            int transition = (lastState << 2) | currState;
            
            switch (transition) {
                // Transitions to state 11 (detent)
                case 0b1011: // 10 -> 11 (clockwise)
                case 0b0100: // 01 -> 00 (clockwise) 
                    encoderPos++;
                    break;
                    
                // Transitions to state 00 (detent)  
                case 0b0111: // 01 -> 11 (counter-clockwise)
                case 0b1000: // 10 -> 00 (counter-clockwise)
                    encoderPos--;
                    break;
            }
        }
        lastState = currState;
        Serial.println("updated encoder");
    }
}*/

void RotaryEncoder::calcEncoder() {
  int stateA = digitalRead(pinA);
  int stateB = digitalRead(pinB);

  if (stateA != lastStateA) {
    
    
    
    if (stateA == stateB) {
      encoderPos--;
    } else {
      encoderPos++;
    }
    
    lastStateA = stateA;
    lastStateB = stateB;
  }

  /*
  if (stateA != lastStateA && stateB != lastStateB) {
    if (stateA == HIGH) {
      if (stateB == LOW) {
        encoderPos++;
      } else {
        encoderPos--;
      }
    } else {
      if (stateB == HIGH) {
        encoderPos++;
      } else {
        encoderPos--;
      }
    }
  lastStateA = stateA;
  lastStateB = stateB;
  }*/
  

  
}











void RotaryEncoder::checkButton() {
  int readState = digitalRead(pinSw);

  if (readState != lastButtonState) {
    lastDebounceTime = millis();
  }
  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (readState != buttonState) {
      buttonState = readState;

      if (buttonState == LOW) {  // Button pressed
        buttonPressStart = millis();
      } else {  // Button released
        unsigned long now = millis();
        btnPressed = true;
        longClick = (now - buttonPressStart > 800);

        if ((now - lastButtonPress) < 350 && lastButtonPress != 0) {
          doubleClick = true;
        }
        lastButtonPress = now;
      }
    }
  }
  lastButtonState = readState;
}
