export const APP_CONFIG = {
  "tabs": [
    { 
      "title": "Noise Gate", 
      "short_name": "Gate", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["threshold_db", "hold", "attack", "release", "level"], 
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
        "knobs": ["level", "drive", "type", "PreLPF", "PreHPF", "PostLPF", "PostHPF", "midFreq", "Mid", "Blend"], 
        "dropdowns": ["dist_type", "ovrd_brand"] 
      } 
    },
    { 
      "title": "Distortion", 
      "short_name": "Dist", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "drive", "type", "PreLPF", "PreHPF", "PostLPF", "PostHPF", "midFreq", "Mid", "blend"], 
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
        "knobs": ["Level","Dry", "Wet1", "Wet2", "Arpeg", "ArpegRate"], 
        "dropdowns": ["Scale", "Mode","harm_wet1","harm_wet2"] 
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
        "dropdowns": ["shift_semitone","shift_direction"] 
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
        "knobs": ["level", "lfoFreq", "lfoDepth", "freq", "feedback", "wet", "dry"], 
        "dropdowns": ["phaser_poles"] 
      } 
    },
    { 
      "title": "Tremolo", 
      "short_name": "Trem", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "depth", "rate","midFreq"], 
        "dropdowns": ["tremolo_mode","waveform"] 
      } 
    },
    { 
      "title": "Amp/Cab", 
      "short_name": "_FIR", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "treble", "mid", "bass", "presence", "gain"], 
        "dropdowns": ["amp_type", "tone_type", "ir_points", "ir_type","ir_file"] 
      } 
    },
    { 
      "title": "Delay", 
      "short_name": "Dely", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "feedback", "time", "LPF", "dry", "wet", "depth", "rate","ser-par"], 
        "dropdowns": ["delay_type", "division","delay-multi"] 
      } 
    },
    { 
      "title": "_NAM", 
      "short_name": "_NAM", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level","pre_att"], 
        "dropdowns": ["NAM_Model"] 
      } 
    },
    { 
      "title": "Reverb", 
      "short_name": "Rvrb", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "feedback", "damp", "dry", "wet", "freeze", "gain", "depth", "rate", "type"], 
        "dropdowns": ["ReverbEngine","ReverbType"] 
      } 
    },
	{ 
      "title": "Generic", 
      "short_name": "Gnrc", 
      "params": { 
        "checkbox": "enable", 
        "knobs": ["level", "par1", "par2", "par3", "par4", "par5", "par6", "par7", "par8", "par9"], 
        "dropdowns": ["generic1", "generic2"]
      } 
    }
  ],
  "dropdowns": {
    "NAM_Model": ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10","11","12","13","14","15","16","17","18","19","20","21","22","23","24","25",],
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
    "division": ["1/32", "1/16", "1/16t", "1/16d", "1/8", "1/8t", "1/8d", "1/4", "1/4t", "1/4d", "1/2", "1"],
	"generic1": ["A1", "B1", "C1", "D1", "E1"],
	"generic2": ["A2", "B2", "C2", "D2", "E2"],
	"ReverbEngine": ["Freeverb","Dattorro"],
	"ReverbType": ["Room","Hall","Plate","Spring"],
	"shift_direction": ["up","down"],
	"shift_semitone": ["detune","1", "2", "3", "4", "5", "6", "7", "8", "9", "11","12"],
	"phaser_poles": ["1", "2", "3", "4"],
	"harm_wet1": ["2", "3", "4", "5","6"],
	"harm_wet2": ["2", "3", "4", "5","6"],
	"tremolo_mode": ["vintage","harmonic"],
	"waveform": ["Sine","Triangle","Saw","Square"],
	"delay-multi": ["1", "2", "3"],
	"ir_file": ["1", "2", "3"]
	
  }
};