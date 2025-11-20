export const APP_CONFIG = {
  "tabs": [
    { 
      "title": "Noise Gate", 
      "short_name": "Gate", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["threshold_db", "hold", "attack", "release", "level", "noise_level", "osc_level"], 
        "dropdowns": [] 
      } 
    },
    { 
      "title": "Compressor", 
      "short_name": "Comp", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "ratio", "threshold", "attack", "release", "wet", "dry", "makeup"], 
        "dropdowns": [] 
      } 
    },
    { 
      "title": "Auto Wah", 
      "short_name": "Awah", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "wah", "dry", "wet", "rate", "start freq", "stop freq"], 
        "dropdowns": [] 
      } 
    },
    { 
      "title": "Overdrive", 
      "short_name": "Ovrd", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "drive", "type", "enPreLPF", "enPreHPF", "enPostLPF", "enPostHPF", "midFreq", "enMid", "blend"], 
        "dropdowns": ["dist_type", "ovrd_brand"] 
      } 
    },
    { 
      "title": "Distortion", 
      "short_name": "Dist", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "drive", "type", "enPreLPF", "enPreHPF", "enPostLPF", "enPostHPF", "midFreq", "enMid", "blend"], 
        "dropdowns": ["dist_type", "dist_brand"] 
      } 
    },
    { 
      "title": "Equalizer", 
      "short_name": "Equl", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "hpf", "100", "200", "400", "800", "1600", "3200", "lpf", "q"], 
        "dropdowns": ["eq_type", "eq_freq_scale"] 
      } 
    },
    { 
      "title": "Harmonizer", 
      "short_name": "Harm", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["Level", "Harm1", "Harm2", "Scale", "Mode", "Dry", "Wet1", "Wet2", "Arpeg", "ArpegRate"], 
        "dropdowns": ["Scale", "Mode"] 
      } 
    },
    { 
      "title": "Vibrato", 
      "short_name": "Vibr", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["rate", "depth", "flutter"], 
        "dropdowns": [] 
      } 
    },
    { 
      "title": "Chorus", 
      "short_name": "Chor", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "rate", "depth", "delay", "feedback", "wet", "dry"], 
        "dropdowns": [] 
      } 
    },
    { 
      "title": "Octave", 
      "short_name": "Octv", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "dry", "wet", "shift", "bufsize"], 
        "dropdowns": [] 
      } 
    },
    { 
      "title": "Flanger", 
      "short_name": "Flng", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "rate", "depth", "feedback", "delay"], 
        "dropdowns": [] 
      } 
    },
    { 
      "title": "Phaser", 
      "short_name": "Phas", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "poles", "lfoFreq", "lfoDepth", "freq", "feedback", "wet", "dry"], 
        "dropdowns": [] 
      } 
    },
    { 
      "title": "Tremolo", 
      "short_name": "Trem", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "depth", "rate"], 
        "dropdowns": [] 
      } 
    },
    { 
      "title": "Amp/Cab", 
      "short_name": "_FIR", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "model", "treble", "mid", "bass", "presence", "gain"], 
        "dropdowns": ["amp_type", "tone_type", "ir_points", "ir_type"] 
      } 
    },
    { 
      "title": "Delay", 
      "short_name": "Dely", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "feedback", "time", "LPF", "dry", "wet", "depth", "rate", "multi", "ser/par"], 
        "dropdowns": ["delay_type", "division"] 
      } 
    },
    { 
      "title": "NAM", 
      "short_name": "_NAM", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level"], 
        "dropdowns": ["NAM_Model"] 
      } 
    },
    { 
      "title": "Reverb", 
      "short_name": "Rvrb", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "feedback", "damp", "dry", "wet", "freeze", "gain", "depth", "rate", "type"], 
        "dropdowns": [] 
      } 
    }
  ],
  "dropdowns": {
    "NAM_Model": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    "amp_type": ["None", "Fender 65", "Twin Reverb", "Marshall", "Orange", "Mesa", "EVH", "Friedman", "VOX", "Bassman", "Custom"],
    "tone_type": ["None", "Fender", "Marshall"],
    "ir_points": ["256", "512", "1024", "2048", "4096", "8192"],
    "ir_type": ["FIR", "FFT", "Part Conv"],
    "Mode": ["Major", "Minor", "Harmonic Minor", "Melodic Minor", "Lydian", "Mixolydian", "Phrygian", "Dorian", "Locrian"],
    "Scale": ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"],
    "dist_type": ["Exp", "Soft", "Hard", "High Gain", "Fuzz", "Assymetric", "Multi Stage", "Tube Amp", "BitCrunch"],
    "delay_type": ["Digital", "Echo", "Tape", "Multi", "Modulated", "PingPong", "Ducking"],
    "dist_brand": ["Rat", "DS2", "MetalZone", "MXR+", "BigMuff"],
    "ovrd_brand": ["TubeScreamer", "Blues Driver", "Klon", "ODR1"],
    "eq_type": ["Neutral", "Mid Scoop", "Mid Boost", "Bass Boost", "Treble Boost"],
    "eq_freq_scale": ["100%", "75%", "50%", "125%", "150%"],
    "division": ["1/32", "1/16", "1/16t", "1/16d", "1/8", "1/8t", "1/8d", "1/4", "1/4t", "1/4d", "1/2", "1"]
  }
};
