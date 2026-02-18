// ============================================================
// config.js  —  Single Source of Truth for ALL effect params
//
// PARAM FLAT ORDER (used in protocol, preset blobs, DSP):
//   Index 0    : checkbox  (enable/disable)
//   Index 1..K : knobs     (in array order)
//   Index K+1..: dropdowns (in array order)
//   Total      : 1 + K + D
//
// This file is also uploaded to the ESP32 LittleFS as /config.json
// via the "Update Config" button in the webapp.
// ============================================================

export const APP_CONFIG = {
  "tabs": [
    {
      "title": "Noise Gate",
      "short_name": "GATE",
      "dsp_tag": "GATE",
      "params": {
        "checkbox": "enable",
        "knobs": ["threshold_db", "hold", "attack", "release", "level"],
        "dropdowns": []
      }
    },
    {
      "title": "Compressor",
      "short_name": "COMP",
      "dsp_tag": "COMP",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "ratio", "threshold", "attack", "release", "wet", "dry", "makeup"],
        "dropdowns": []
      }
    },
    {
      "title": "Auto Wah",
      "short_name": "AWAH",
      "dsp_tag": "AWAH",
      "params": {
        "checkbox": "enable",
        "knobs": ["dry", "wet", "sensitivity", "Q", "freq_center", "freq_min", "freq_max", "attack", "decay"],
        "dropdowns": ["awah_filter", "awah_mode", "awah_direction"]
      }
    },
    {
      "title": "Overdrive",
      "short_name": "OVRD",
      "dsp_tag": "OVRD",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "drive", "type", "PreLPF", "PreHPF", "PostLPF", "PostHPF", "midFreq", "Mid", "Blend"],
        "dropdowns": ["dist_type", "ovrd_brand"]
      }
    },
    {
      "title": "Distortion",
      "short_name": "DIST",
      "dsp_tag": "DIST",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "drive", "type", "PreLPF", "PreHPF", "PostLPF", "PostHPF", "midFreq", "Mid", "blend"],
        "dropdowns": ["dist_type", "dist_brand"]
      }
    },
    {
      "title": "Equalizer",
      "short_name": "EQUL",
      "dsp_tag": "EQUL",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "hpf", "100", "200", "400", "800", "1600", "3200", "lpf", "q"],
        "dropdowns": ["eq_type", "eq_freq_scale"]
      }
    },
    {
      "title": "Harmonizer",
      "short_name": "HARM",
      "dsp_tag": "HARM",
      "params": {
        "checkbox": "enable",
        "knobs": ["Level", "Dry", "Wet1", "Wet2", "ArpegRate","Gate","Glide"],
        "dropdowns": ["Scale", "Mode", "Harm1", "Harm2","Arpg","Synth"]
      }
    },
    {
      "title": "Vibrato",
      "short_name": "VIBR",
      "dsp_tag": "VIBR",
      "params": {
        "checkbox": "enable",
        "knobs": ["rate", "depth", "flutter"],
        "dropdowns": []
      }
    },
    {
      "title": "Chorus",
      "short_name": "CHOR",
      "dsp_tag": "CHOR",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "rate", "depth", "delay", "feedback", "wet", "dry"],
        "dropdowns": []
      }
    },
    {
      "title": "Octave",
      "short_name": "OCTV",
      "dsp_tag": "OCTV",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "dry", "wet", "shift", "bufsize"],
        "dropdowns": ["shift_semitone", "shift_direction"]
      }
    },
    {
      "title": "Flanger",
      "short_name": "FLNG",
      "dsp_tag": "FLNG",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "rate", "depth", "feedback", "delay"],
        "dropdowns": []
      }
    },
    {
      "title": "Phaser",
      "short_name": "PHAS",
      "dsp_tag": "PHAS",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "lfoFreq", "lfoDepth", "freq", "feedback", "wet", "dry"],
        "dropdowns": ["phaser_poles"]
      }
    },
    {
      "title": "Tremolo",
      "short_name": "TREM",
      "dsp_tag": "TREM",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "depth", "rate", "midFreq"],
        "dropdowns": ["tremolo_mode", "waveform"]
      }
    },
    {
      "title": "Amp/Cab",
      "short_name": "_FIR",
      "dsp_tag": "_FIR",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "treble", "mid", "bass", "presence", "gain"],
        "dropdowns": ["amp_type", "tone_type", "ir_points", "ir_type", "ir_file"]
      }
    },
    {
      "title": "Delay",
      "short_name": "DELY",
      "dsp_tag": "DELY",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "feedback", "time", "LPF", "dry", "wet", "depth", "rate", "ser-par"],
        "dropdowns": ["delay_type", "division", "delay-multi"]
      }
    },
    {
      "title": "_NAM",
      "short_name": "_NAM",
      "dsp_tag": "NAM ",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "pre_att"],
        "dropdowns": ["NAM_Model"]
      }
    },
    {
      "title": "Reverb",
      "short_name": "RVRB",
      "dsp_tag": "RVRB",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "feedback", "damp", "dry", "wet", "freeze", "gain", "depth", "rate", "type"],
        "dropdowns": ["ReverbEngine", "ReverbType"]
      }
    },
    {
      "title": "Generic",
      "short_name": "GNRC",
      "dsp_tag": "GNRC",
      "params": {
        "checkbox": "enable",
        "knobs": ["level", "par1", "par2", "par3", "par4", "par5", "par6", "par7", "par8", "par9"],
        "dropdowns": ["generic1", "generic2"]
      }
    }
  ],

  // Dropdown option lists (referenced by name in params.dropdowns)
  "dropdowns": {
    "NAM_Model":        ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25"],
    "amp_type":         ["None","Fender 65","Twin Reverb","Marshall","Orange","Mesa","EVH","Friedman","VOX","Bassman","Custom"],
    "tone_type":        ["None","Fender","Marshall"],
    "ir_points":        ["256","512","1024","2048","4096","8192"],
    "ir_type":          ["FIR","FFT","Part Conv"],
    "Mode":             ["Major","Minor","Harmonic Minor","Melodic Minor","Lydian","Mixolydian","Phrygian","Dorian","Locrian"],
    "Scale":            ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"],
    "dist_type":        ["Exp","Soft","Hard","High Gain","Fuzz","Assymetric","Multi Stage","Tube Amp","BitCrunch"],
    "delay_type":       ["Digital","Echo","Tape","Multi","Modulated","PingPong","Ducking"],
    "dist_brand":       ["Rat","DS2","MetalZone","MXR+","BigMuff"],
    "ovrd_brand":       ["TubeScreamer","Blues Driver","Klon","ODR1"],
    "eq_type":          ["Neutral","Mid Scoop","Mid Boost","Bass Boost","Treble Boost"],
    "eq_freq_scale":    ["100%","75%","50%","125%","150%"],
    "division":         ["1/32","1/16","1/16t","1/16d","1/8","1/8t","1/8d","1/4","1/4t","1/4d","1/2","1"],
    "generic1":         ["A1","B1","C1","D1","E1"],
    "generic2":         ["A2","B2","C2","D2","E2"],
    "ReverbEngine":     ["Freeverb","Dattorro"],
    "ReverbType":       ["Room","Hall","Plate","Spring"],
    "shift_direction":  ["up","down"],
    "shift_semitone":   ["detune","1","2","3","4","5","6","7","8","9","11","12"],
    "phaser_poles":     ["1","2","3","4"],
    "Harm1":        	["-2","-3","-4","-5","-6","2","3","4","5","6"],
    "Harm2":       		["-2","-3","-4","-5","-6","2","3","4","5","6"],
	"Arpg":        		["None","Classic up","Classic down","Up-down","Full scale up","Full scale down","Triad bounce","Seventh chord","Suspended","Octave jumps","Thirds run","Alberti bass"],
	"Synth":            ["None","Bass","Church","Hammond1","Hammond2","Hammond3","String","Brass","Pad1","Pad2","Saw","Square","Moog","Sync","Pluck","Vibes"],
    "tremolo_mode":     ["vintage","harmonic"],
    "waveform":         ["Sine","Triangle","Saw","Square"],
    "delay-multi":      ["1","2","3"],
    "ir_file":          ["1","2","3"],
    "awah_filter":      ["LowPass","BandPass","HighPass"],
    "awah_mode":        ["Envelope","Humanizer"],
    "awah_direction":   ["Up","Down"]
  }
};

// ================================================================
// Helpers — used by app.js, Protocol.js, and the build/gen tools
// ================================================================

/** Total flat param count for one effect tab: 1(checkbox) + K + D */
export function getFlatParamCount(tab) {
  return 1 + tab.params.knobs.length + tab.params.dropdowns.length;
}

/**
 * Given a flat index, return { type: 'checkbox'|'knob'|'dropdown', index }
 *   flat 0            → checkbox
 *   flat 1..K         → knob[flatIdx-1]
 *   flat K+1..K+D     → dropdown[flatIdx-1-K]
 */
export function flatIndexToParam(tab, flatIdx) {
  if (flatIdx === 0) return { type: 'checkbox', index: 0 };
  const kLen = tab.params.knobs.length;
  if (flatIdx <= kLen) return { type: 'knob', index: flatIdx - 1 };
  return { type: 'dropdown', index: flatIdx - 1 - kLen };
}

/** Inverse of flatIndexToParam */
export function paramToFlatIndex(tab, type, index) {
  if (type === 'checkbox') return 0;
  if (type === 'knob')     return 1 + index;
  return 1 + tab.params.knobs.length + index;
}

/**
 * Build a flat param array (Uint8Array) for one effect from app state.
 * Used by Protocol.serializeState and Protocol.createParamUpdate.
 *   result[0]   = enable (0/1)
 *   result[1+k] = knob k value
 *   result[1+K+d] = dropdown d value
 */
export function buildFlatParams(tab, fxState, fxParams) {
  const K = tab.params.knobs.length;
  const D = tab.params.dropdowns.length;
  const arr = new Uint8Array(1 + K + D);
  arr[0] = fxState && fxState.enabled ? 1 : 0;
  for (let k = 0; k < K; k++) {
    arr[1 + k] = (fxParams && fxParams[`knob${k}`] !== undefined) ? fxParams[`knob${k}`] : 50;
  }
  for (let d = 0; d < D; d++) {
    arr[1 + K + d] = (fxParams && fxParams[`dropdown${d}`] !== undefined) ? fxParams[`dropdown${d}`] : 0;
  }
  return arr;
}
