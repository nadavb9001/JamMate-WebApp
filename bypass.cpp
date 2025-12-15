#define BLOCK_SIZE 256


#include "Parameters.h"
#include "distortion_effect.h"
#include "reverb_effect.h"
#include "delay_effect.h"
#include "fir_effect.h"
#include "autowah_effect.h"
#include "noisegate_effect.h"
#include "compressor_effect.h"
#include "equalizer_effect.h"
#include "tremolo_effect.h"
#include "phaser_effect.h"
#include "flanger_effect.h"
#include "chorus_effect.h"
#include "pitchshifter_effect.h"
//#include "AmplifierIRMeasurement.h"
#include "nam_model.hpp"
#include "harmonizer_effect.h"
#include "readWav.hpp"
#include "LOOPER.hpp"
//#include "drum_midi_effect.hpp"
#include "DRUM_MIDI_EFFECT.hpp"

float          DelayReverbSerialParallel = 0.0f;
size_t         loopSize                  = 0;
JM_Looper      looper;
MidiDrumPlayer drum_player;
int            SampleCounter = 0;
char filepath[50] = {0}, currentfilepath[50] = {0}; // Buffer to hold the result
MyCpuLoadMeter      cpuMeter;
OnePole             env;
DSY_SDRAM_BSS char  nam_file_list[MAX_NAM_FILES][MAX_NAM_PATH_LENGTH];
DSY_SDRAM_BSS float loaded_weights[1024]; // Example weights array.
int num_nam_files_found=0,num_ir_files_found=0;
// 1. Define the duration for a "long press" in seconds
constexpr float kLongPressDurationSeconds = 2.0f;
// 2. Define the delay in the main loop (in milliseconds)
constexpr int kLoopDelayMs = 1000;

// 3. Calculate the time delta in seconds for each loop iteration
constexpr float kDeltaTimeSeconds = kLoopDelayMs / 1000.0f;
// 2. Variables to track the pressed state duration
static float sw1_held_time = 0.0f;
static float sw2_held_time = 0.0f;


DSY_SDRAM_BSS DelayLine<float, 48000> del1R;
bool                                  enableBypass = 0;
float                                 sampleRate   = 48000.0f;
distortion_effect DSY_RAM_D2          jm_overdrive;
distortion_effect DSY_RAM_D2          jm_distortion;
reverb_effect DSY_RAM_D2              jm_freeverb;
delay_effect                          jm_delay;
DSY_SDRAM_BSS DelayLine<float, 48000> delay_effect::del1a;
DSY_SDRAM_BSS DelayLine<float, 48000> delay_effect::del2a;
fir_effect DSY_ITCMRAM_BSS            jm_fir;
autowah_effect                        jm_autowah;
noisegate_effect                      jm_noisegate;
compressor_effect                     jm_compressor;
equalizer_effect                      jm_equalizer;
tremolo_effect                        jm_tremolo;
phaser_effect DSY_RAM_D2              jm_phaser;
flanger_effect                        jm_flanger;
chorus_effect                         jm_chorus;
pitchshifter_effect DSY_DTCMRAM       jm_pitchshifter;
WhiteNoise                            IRnoise;
harmonizer_effect                     jm_harmonizer;

#include "presets.h"

Preset_t UsedPreset = Preset_Clean_Reverb;
void     ReadWrirtIR(const char* FileName, float* IR, int count, bool isFir);

void                    CheckForLongPress();
DSY_TEXT SdmmcHandler   sdcard;
DSY_TEXT FatFSInterface fsi;
DSY_TEXT FIL            SDFile;
DSY_TEXT SdmmcHandler::Config sd_cfg;
DSY_TEXT DIR                  dir;
DSY_TEXT FILINFO              fil;

UartHandler::Config UARTconfig;

float metro_sine, metro_freq = 3.0f;

TimerHandle::Config                   TIMconfig  = TimerHandle::Config();
const int                             BytestRecv = 17, BytesTran = 256;
uint8_t DMA_BUFFER_MEM_SECTION        rx_buff[BytestRecv];
static uint8_t DMA_BUFFER_MEM_SECTION tx_buff[BytesTran];
static uint8_t DMA_BUFFER_MEM_SECTION bfr[5];
FLOATUNION_t                          a, b;

uint32_t       last_action_time  = 0;
uint32_t       last_action_time2 = 0;
const uint32_t interval_ms       = 5000; // 1 second interval

constexpr int buffer_size = 1024.0 / 4.0;

int OscCnt = 0, frameCounter = 0;

void SendNamList();
void SendIRList();
static void AudioCallback(AudioHandle::InputBuffer  in,
                          AudioHandle::OutputBuffer out,
                          size_t                    size);

const int bufferSize = 2048;
size_t    bufferPtr, cnt;
const int smbProcessFrameSize = 256;

float max_sum;
int   pitch_index, old_pitch_index;


DaisySeed   hw;
TimerHandle timer;
UartHandler uart;
uint8_t     tx, comMIDI;
float       Semitones1 = 0.0f;
float       Semitones2 = 0.0f;
void        UpdateParam(uint8_t* data);
bool        available = false;
int         cnt_zc    = 0;
int         counter   = 0;
int         ir_cnt = 0, ir_index = 0;
float       envRMS        = 0;
float       old_freq      = -1;
int         metro1Counter = 0, metro2Counter = 0;
bool        updtParam = false;
int         counta = 0, m = 1, k = 0, cp = 0, t = 0;
bool        enPulse       = 0;
size_t      pulseIndex    = 0;
int         NAM_FileIndex = 0;
int         IR_FileIndex  = 0;

bool updateNAM = false;
bool enableNAM = false;





// ===================================================================
// DSP Communication Protocol v4
// ===================================================================
void RestartUartRx(void* state, UartHandler::Result res)
{
    updtParam = true;


    uart.DmaReceive(rx_buff, BytestRecv, NULL, RestartUartRx, NULL);
}

// Generic Sender
void sendDataPacket(const char* header, const void* data, uint32_t len)
{
    // 1. Send Header (4 bytes)
    // Using hw.uart for DaisySeed, adjust if using a different handle
    uart.BlockingTransmit((uint8_t*)header, 4, 10);

    // 2. Send Length (4 bytes, Little Endian)
    uart.BlockingTransmit((uint8_t*)&len, 4, 10);

    // 3. Send Payload
    if(len > 0 && data != nullptr)
    {
        // Higher timeout for data to ensure complete transfer
        uart.BlockingTransmit((uint8_t*)data, len, 100);
    }
}


// ===== DMA TX Manager =====
struct DmaTxManager
{
    //uint8_t  tx_buffer[256];
    bool     tx_ready        = true;
    uint32_t packets_sent    = 0;
    uint32_t packets_dropped = 0;
    uint32_t errors          = 0;
};

static DmaTxManager dma_tx;

// ===== TX Completion Handler =====
void sendDataPacketDmaComplete(void* context, UartHandler::Result result)
{
    hw.PrintLine("🎉 DMA TX Complete! result=%d", (int)result);
    if(result == UartHandler::Result::OK)
        dma_tx.packets_sent++;
    else
        dma_tx.errors++;
    dma_tx.tx_ready = true;
}

// ===== Enhanced sendDataPacket() with metrics =====
/*void sendDataPacket(const char* header, const void* data, uint32_t len) {
    if(!dma_tx.tx_ready || len > 248) {
        dma_tx.packets_dropped++;
        return;
    }
    dma_tx.tx_ready = false;
    uint32_t total_size = 8 + len;
    uart.DmaListenStop();
    memcpy(tx_buff, header, 4);
    tx_buff[4] = (len >> 0) & 0xFF;
    tx_buff[5] = (len >> 8) & 0xFF;
    tx_buff[6] = (len >> 16) & 0xFF;
    tx_buff[7] = (len >> 24) & 0xFF;
    if(len > 0 && data) memcpy(tx_buff + 8, data, len);

    UartHandler::Result r = uart.DmaTransmit(
        tx_buff, total_size, nullptr, sendDataPacketDmaComplete, nullptr
    );

    uart.DmaReceive(rx_buff, BytestRecv, NULL, RestartUartRx, NULL);
    if(r != UartHandler::Result::OK) {
        hw.PrintLine("❌ DMA TX failed: %d", (int)r);
        dma_tx.tx_ready = true;
    }
}*/

// ===== Query Functions =====
uint32_t GetDmaTxPacketsSent()
{
    return dma_tx.packets_sent;
}

uint32_t GetDmaTxPacketsDropped()
{
    return dma_tx.packets_dropped;
}

uint32_t GetDmaTxErrors()
{
    return dma_tx.errors;
}


// Specific Senders (Wrappers)

void sendTunerFreq(float freq)
{
    // Payload: [Freq (4 bytes)]
    // Header: "TUNE"
    sendDataPacket("TUNE", &freq, sizeof(float));
}

void sendCPULoad(float load)
{
    // Payload: [Load (4 bytes)]
    // Header: "LOAD"
    sendDataPacket("LOAD", &load, sizeof(float));
}

// ===================================================================
// HELPER: Send NAM List
// ===================================================================
void SendNamList() {
    // 1. Send Clear Command first (tell App to empty the list)
    // We send index 255 as a flag for "Clear List"
    uint8_t clearPayload[1] = { 255 }; 
    sendDataPacket("NAML", clearPayload, sizeof(uint8_t));
    System::Delay(20);

    // 2. Loop and Send Files
    for (int i = 0; i < num_nam_files_found; i++) {
        if (strlen(nam_file_list[i]) == 0) break; // Stop at empty string

        uint8_t len = strlen(nam_file_list[i]);
        if (len > 30) len = 30; // Safety cap

        // Payload: [Index] [String...]
        uint8_t payload[32];
        payload[0] = (uint8_t)i;
        memcpy(&payload[1], nam_file_list[i], len);
        hw.PrintLine("Sending NAM File[%d]: %s", i, nam_file_list[i]);
        sendDataPacket("NAML", payload, (len + 1));
        System::Delay(30); // Small delay to prevent buffer flood
    }
}

void SendIRList() {
    // 1. Send Clear Command first (tell App to empty the list)
    // We send index 255 as a flag for "Clear List"
    uint8_t clearPayload[1] = { 255 }; 
    sendDataPacket("IRFL", clearPayload, sizeof(uint8_t));
    System::Delay(20);

    // 2. Loop and Send Files
    for (int i = 0; i < num_ir_files_found; i++) {
        if (strlen(ir_file_list[i]) == 0) break; // Stop at empty string

        uint8_t len = strlen(ir_file_list[i]);
        if (len > 30) len = 30; // Safety cap

        // Payload: [Index] [String...]
        uint8_t payload[32];
        payload[0] = (uint8_t)i;
        memcpy(&payload[1], ir_file_list[i], len);
        hw.PrintLine("Sending IR File[%d]: %s", i, ir_file_list[i]);
        sendDataPacket("IRFL", payload, (len + 1));
        System::Delay(30); // Small delay to prevent buffer flood
    }
}

// Future: Send FFT Data
// void sendSpectralData(float* bins, int count) {
//    sendDataPacket("SPEC", bins, count * sizeof(float));
// }


/*void RestartUart(void* state, UartHandler::Result res);
// dma end callback, will start a new DMA transfer
void RestartUart(void* state, UartHandler::Result res)
{
    //if(res != UartHandler::Result::ERR)
    //{

    uart.DmaTransmit(bfr, 1, NULL, RestartUart, NULL);

    //}
}*/


void TimerCallback(void* data)
{
    //CalcPitch();
    //uart.BlockingTransmit(&a, 1, 100);
    //hw.PrintLine("%1.6f", envRMS);
    if(LooperParam.en == 0 && TunerParam.en == 0)
    {
        /*sw1.Debounce();
        sw2.Debounce();

        if(sw2.FallingEdge())
        {
            sw2_pressed = 1;

            if(currPreset > 0)
                currPreset--;
            updatePreset(presetList[currPreset]);
            //hw.PrintLine("%d",currPreset);
            //BlinkLed(currPreset +1,250);
        }

        if(sw1.FallingEdge())
        {
            sw1_pressed = 1;
            BlinkLed(3, 250);
            
            if(currPreset < 4)
                currPreset++ % 5;

            updatePreset(presetList[currPreset++]);
            //hw.PrintLine("%d",currPreset);
            //BlinkLed(currPreset +1,250);
                  
            
        }*/
    }

    if(LooperParam.en)
    {
        sw1.Debounce();
        sw2.Debounce();

        //hw.PrintLine("%1.3f",envRMS*1000.0f);

        if(sw1.FallingEdge())
        {
            sw1_pressed = 1;
            looper.TriggerUndo(); // .undo();
            if(looper.cur_layer == 0)
            {
                looper.TriggerStop();
                looper.TriggerClear();
            }
        }

        if(sw2.FallingEdge())
        {
            sw2_pressed = 1;
            //if(jm_drummer.enable == 0)
            looper.TriggerRecord();
            //else armLooper = 1;

            //hw.SetLed(looper.recording);

            //if ( ==0) {armLooper = 1; hw.PrintLine("arm=1");}
            //if (armLooper ==2) {armLooper = 0; hw.PrintLine("arm=0");}
        }
    }
    if(jm_harmonizer.enable)
    {
        jm_harmonizer.calc_pitch();
        /*hw.PrintLine(
            "Freq: %3.3f Hz, Closest Note Index: %d, Semitones1: %f, Mode: %f, "
            "Scale: %f",
            jm_harmonizer.frq,
            jm_harmonizer.closeIndex,
            jm_harmonizer.Semitones1,
            jm_harmonizer.mode,
            jm_harmonizer.scale);*/
    }
    if(util_tuner_enabled)
    {
        jm_harmonizer.calc_pitch();
        
        //if(cntTune++ > 10)
        //{
            //cntTune = 0;
            hw.PrintLine("Freq: %3.3f Hz", jm_harmonizer.frq);
            sendDataPacket("TUNE", &jm_harmonizer.frq, sizeof(float));
        //}
    }
}

int SelectedPresetIndex = 0;

void UpdateParam(uint8_t* data)
{
    char Header[5];
    sprintf(Header, "%c%c%c%c", data[0], data[1], data[2], data[3]);
    char Header2[3];
    sprintf(Header2, "%c%c", data[0], data[1]);

    if(strncmp(Header, "MIDI", 4) == 0)
    {
        comMIDI = data[8];
    }

    // If ESP/WebApp sends "REQL", we resend the NAM list
    else if(strncmp(Header, "REQL", 4) == 0) {
        SendNamList();
        return;
    }


    else if(strncmp(Header, "GEN ", 4) == 0)
    {
        MasterVol = data[4] / 100.0f;
        BPM       = data[6];
    }
    
    else if(strncmp(Header, "UTIL", 4) == 0)
    {
        uint8_t  type = data[4];
        uint8_t  en   = data[5];
        uint8_t  lvl  = data[6];
        uint16_t freq = (data[7] << 8) | data[8];

        switch(type)
        {
            case NOISE:
                util_noise_enabled = (en > 0);
                util_noise_level   = lvl / 100.0f;
                noise.SetAmp(util_noise_level); // If supported
                break;
            case TONE:
                util_tone_enabled = (en > 0);
                util_tone_level   = lvl / 100.0f;
                testTone.SetFreq((float)freq);
                testTone.SetAmp(util_tone_level);
                break;
            case TUNER:
                util_tuner_enabled = (en > 0);
                if(util_tuner_enabled)
                {
                    hw.PrintLine("Tuner Enabled");
                    timer.SetPeriod(3000);
                    timer.Start();
                }
                else
                {
                    hw.PrintLine("Tuner Disabled");
                    timer.Stop();
                }
                break;
        }
        return;
    }

    else if(strcmp(Header, "IRLR") == 0)
    {
        // This is an IR Data Packet
        // The payload starts at index 4 and contains up to 3 floats
        for(int i = 0; i < 3; ++i)
        {
            // Ensure we do not write past the end of our buffer
            if(ir_data_index < MAX_IR_SIZE)
            {
                FLOATUNION_t converter;
                // Copy 4 bytes from the packet payload into the union
                memcpy(converter.bytes, &data[4 + (i * 4)], 4);
                // Store the converted float value in our main buffer
                ir_data_buffer[ir_data_index] = converter.number;
                //Bassman[ir_data_index]  = converter.number;
                ir_data_index++;
            }
        }
        return;
    }

    else if(strcmp(Header, "IREN") == 0)
    {
        // This is the End-of-Transmission Packet

        // Reset the index for the next transfer
        total_ir_points = ir_data_index;
        //cab_sim.LoadExternalIR(ir_data_buffer, min((int)total_ir_points, 8192));

        ir_data_index = 0;
        // The payload contains the total points and sample rate as uint32_t
        // Copy bytes for total_ir_points (little-endian)
        //memcpy(&total_ir_points, &data[4], 4);

        // Copy bytes for ir_sample_rate (little-endian)
        //memcpy(&ir_sample_rate, &data[8], 4);

        // --- IR RECEPTION COMPLETE ---
        // At this point, the ir_data_buffer holds the complete IR.
        // You can now set a flag to process it, e.g., in your audio callback.
        // For debugging:
        //hw.PrintLine("IR reception complete.\n");
        //hw.PrintLine("Total Points: %lu, Sample Rate: %lu\n",
        //       total_ir_points,
        //       ir_sample_rate);
        //BlinkLed(5, 250);

        return;
    }

    else if(strcmp(Header, "BYPS") == 0) // Enable Bypass
    {
        enableBypass = data[4] > 0;
    }

    else if(strcmp(Header, "NAM ") == 0) // Enable Bypass
    {
        if(data[7] != NAM_FileIndex)
        {
            NAM_FileIndex = data[7];
            updateNAM     = true;
        }
        enableNAM = data[4] > 0;
        levelNAM  = data[5] / 100.0f;
        //preLevenNAM = data[6];
        preLevenNAM = data[6] / 100.0f;  // normalize to [0,1]
        preLevenNAM =  expm1f(-5.0f * preLevenNAM) / expm1f(-5.0f);
        //SendNamList();
        
        return;
    }


    else if(strcmp(Header, "DRMP") == 0) // Drum Pattern
    {
        // Combine the two bytes into a 16-bit value
        uint16_t snareval = (static_cast<uint16_t>(data[11]) << 8) | data[12];
        uint16_t hihatval = (static_cast<uint16_t>(data[13]) << 8) | data[14];
        uint16_t kickval  = (static_cast<uint16_t>(data[15]) << 8) | data[16];
        // Convert the combined value to a bitset
        std::bitset<16> bitset_snare(snareval);
        std::bitset<16> bitset_hihat(hihatval);
        std::bitset<16> bitset_kick(kickval);
        // Store the bits in the boolean array
        for(int i = 0; i < 16; ++i)
        {
            /*jm_drummer.Ptrn.snare_pattern[i]
                = bitset_snare[15 - i]; // Big-endian order
            jm_drummer.Ptrn.closedhihat_pattern[i]
                = bitset_hihat[15 - i]; // Big-endian order
            jm_drummer.Ptrn.bassdrum_pattern[i]
                = bitset_kick[15 - i]; // Big-endian order*/
        }
        return;
    }

    else if(strcmp(Header, "LOOP") == 0)
    {
        LooperParam.en = data[4] > 0;
        //LooperParam.Start    = data[5] > 0;
        LooperParam.Stop     = data[6] > 0;
        LooperParam.Clear    = data[7] > 0;
        LooperParam.Undo     = data[8] > 0;
        LooperParam.Redo     = data[9] > 0;
        LooperParam.ClearAll = data[10] > 0;
        LooperParam.LoopVol  = data[5] / 100.0f;
        LooperParam.Sync     = data[15];
        if(LooperParam.en == 1)
        {
            timer.SetPeriod(50);
            timer.Start();
        }
        if(LooperParam.en == 0)
        {
            timer.Stop();
        }
        //
        //if(LooperParam.en)
        //SavePresetToSD("preset.jm",Preset_Overdrive);
        //bool a;
        //if (a == 0)
        //PresetBank[0][1] = Preset_Distortion1;
        //updatePreset(Preset_Clean_Reverb);

        //else

        //updatePreset(PresetBank[0][SelectedPresetIndex % 5]);
        //SelectedPresetIndex++;
        //a = !a;
        //hw.PrintLine("%d" ,CurrentPreset);
        return;
    }

    else if(strcmp(Header, "PRES") == 0)
    {
        if(data[7] < 101)
            MasterVol = data[7] / 100.0f;
        BPM = (int)data[8];
        if((data[5]) == CurrentBank && (data[6]) == CurrentPreset)
            return;


        return;
    }


    else if(strcmp(Header, "AWAH") == 0)
    {
        //jm_autowah.update_param(data);
        jm_autowah.enable = data[4];
        jm_autowah.setPreset(data[5]);
        return;
    }
    else if(strcmp(Header, "GATE") == 0)
    {
        jm_noisegate.update_param(data);
        return;
    }
    else if(strcmp(Header, "FLSH") == 0)
    {
        System::ResetToBootloader(
            System::BootloaderMode::DAISY_INFINITE_TIMEOUT);

        return;
    }
    else if(strcmp(Header, "RSTD") == 0)
    {
        System::ResetToBootloader(System::BootloaderMode::DAISY_SKIP_TIMEOUT);

        return;
    }


    else if(strcmp(Header, "EQUL") == 0) // Equl??? UART error?
    {
        jm_equalizer.update_param(data);


        return;
    }

    else if(strcmp(Header2, "EQ") == 0) // Equl??? UART error?
    {
        jm_equalizer.update_param(data);
        return;
    }

    else if(strcmp(Header, "COMP") == 0)
    {
        jm_compressor.update_param(data);
        return;
    }

    else if(strcmp(Header, "PHAS") == 0)
    {
        jm_phaser.update_param(data);
        return;
    }

    else if(strcmp(Header, "OCTV") == 0)
    {
        jm_pitchshifter.update_param(data);
        return;
    }
    if(strcmp(Header, "DELY") == 0)
    {
        jm_delay.update_param(data);
        return;
    }

    else if(strcmp(Header, "RVRB") == 0)
    {
        jm_freeverb.update_param(data);
        return;
    }

    else if(strcmp(Header, "OVRD") == 0)
    {
        jm_overdrive.update_param(data);
        return;
    }

    else if(strcmp(Header, "DIST") == 0)
    {
        jm_distortion.update_param(data);
        return;
    }
    else if(strcmp(Header, "CHOR") == 0)
    {
        jm_chorus.update_param(data);
        return;
    }

    else if(strcmp(Header, "TREM") == 0)
    {
        //enPulse    = data[4];
        //pulseIndex = 0;
        jm_tremolo.update_param(data);
        return;
    }

    else if(strcmp(Header, "FLNG") == 0)
    {
        jm_flanger.update_param(data);
        return;
    }

    else if(strcmp(Header, "_FIR") == 0 || strcmp(Header, "FIR ") == 0)
    {
        jm_fir.update_param(data);
        return;
    }


    else if(strcmp(Header, "DRUM") == 0)
    {
        // Style array - matches your selection box
        const char* styles[] = {"rock",
                                "blues",
                                "jazz",
                                "shuffle",
                                "pop",
                                "metal",
                                "latin",
                                "rnb",
                                "country",
                                "funk",
                                "swing"};
        //jm_drummer.update_param(data);
        //drum_machine.enable = (data[4] > 0);
        //drum_machine.set_pattern(data[5]);
        //drum_machine.set_bpm(data[6]);
        //drum_machine.reset();
        drum_player.SetBPM(data[6]);
        drum_player.enable = (data[4] > 0);
        drum_player.level  = data[5] / 100.0f;

        int         style_idx     = min((int)data[14], 6);
        const char* selectedStyle = styles[style_idx];
        int         number_idx    = min((int)data[13], 6);

        // Update file name and load the MIDI in the main while(1) loop
        // Only way it works !?!
        sprintf(filepath, "0:/DrumMidi/%s%d.mid", selectedStyle, number_idx);
        //hw.PrintLine(filepath);
        /*if(drum_player.LoadFromSD(filepath))
        {
            hw.PrintLine("MIDI loaded");
            
        }
        else
        {
            hw.PrintLine("MIDI not loaded");
            drum_player.LoadFromSD("0:/DrumMidi/blues1.mid");
        }*/
        //drum_player.LoadFromSD(filepath);

        //if(data[6] < 100)
        //    drum_player.LoadFromSD("0:/DrumMidi/blues1.mid");
        //else
        //    drum_player.LoadFromSD("0:/DrumMidi/blues1.mid");


        en_drummer = (data[4] > 0);
        BPM        = (int)data[6];

        return;
    }

    else if(strcmp(Header, "METR") == 0)
    {
        MetronomeParam.en      = data[4];
        MetronomeParam.Level   = data[5];
        MetronomeParam.BPM     = data[6];
        MetronomeParam.Pattern = data[7];

        //clock.SetFreq(MetronomeParam.BPM / 60.0f * 4.0f); // 16 for 1/16 beat division;
        return;
    }

    else if(strcmp(Header, "HARM") == 0) // Equl??? UART error?
    {
        jm_harmonizer.update_param(data);

        if(jm_harmonizer.enable == 1)
        {
            timer.Start();
            timer.SetPeriod(jm_harmonizer.wet2 * 10);
        }
        else
        {
            timer.Stop();
        }

        return;
    }
    else
    {
        hw.PrintLine("Unknown Header: %s", Header);
        uart.Init(UARTconfig);
    }
}
//************************* */

int debounceCounter = 0;

static void AudioCallback(AudioHandle::InputBuffer  in,
                          AudioHandle::OutputBuffer out,
                          size_t                    size)
{
    float out1[BLOCK_SIZE];
    float in1[BLOCK_SIZE];
    loopSize = size;

    //memcpy(out, in, size * sizeof(float));
    //return;

    if(!weights_loaded)
    {
        //rtneural_wavenet.load_weights(BossOD3_weights);
        load_nano_weights(BossOD3_weights_data);
        weights_loaded = true;
        return; // Skip first block
    }

    cpuMeter.OnBlockStart();
    if(enableBypass)
    {
        memcpy(out, in, size * sizeof(float));
        return;
    }

    memcpy(in1, in[0], size * sizeof(float));
    memcpy(out1, in[0], size * sizeof(float));

    if(util_tuner_enabled)
    {
        ringBuf.pushBlock(in[0], size);
    }

    if(enPulse == 1)
    {
        for(size_t i = 0; i < size; i++)
        {
            in1[i] = pulseIndex < 3 ? 1.0f : 0.0f;
            pulseIndex++;
            if(pulseIndex > 8192)
            {
                pulseIndex = 0;
            }
        }
    }

    if(util_noise_enabled)
    {
        for(size_t i = 0; i < size; i++)
        {
            in1[i]  = noise.Process();
            out1[i] = in1[i];
        }
    }

    if(util_tone_enabled)
    {
        for(size_t i = 0; i < size; i++)
        {
            in1[i] += testTone.Process();
            out1[i] = in1[i];
        }
    }


    if(jm_noisegate.enable == 1)
    {
        jm_noisegate.processBlock(in1, out1, size);
    }

    if(jm_compressor.enable == 1)
    {
        jm_compressor.processBlock(in1, out1, size);
    }

    if(jm_autowah.enable == 1)
    {
        jm_autowah.processBlock(in1, out1, size);
        memcpy(in1, out1, size * sizeof(float));
    }

    if(jm_overdrive.enable == 1)
    {
        jm_overdrive.processBlock(in1, out1, size);
    }

    if(jm_distortion.enable == 1)
    {
        jm_distortion.processBlock(in1, out1, size);
    }

    if(enableNAM == 1)
    {
        float temp_in1[BLOCK_SIZE];

        arm_scale_f32(in1, preLevenNAM, temp_in1, size);
        rtneural_wavenet.forward(temp_in1, out1, size);
        arm_scale_f32(out1, levelNAM, out1, size);
        memcpy(in1, out1, size * sizeof(float));
    }

    if(jm_equalizer.enable == 1)
    {
        jm_equalizer.processBlock(in1, out1, size);
    }


    if(jm_harmonizer.enable == 1)

    {
        ringBuf.pushBlock(in1, size);
        jm_harmonizer.processBlock(in1, out1, size);
    }

    if(jm_pitchshifter.enable == 1)
    {
        jm_pitchshifter.processBlock(in1, out1, size);
    }

    if(jm_chorus.enable == 1)
    {
        jm_chorus.processBlock(in1, out1, size);
    }

    if(jm_tremolo.enable == 1)
    {
        jm_tremolo.processBlock(in1, out1, size);
    }

    if(jm_phaser.enable == 1)
    {
        jm_phaser.processBlock(in1, out1, size);
    }

    if(jm_fir.enable == 1)
    {
        jm_fir.processBlock(in1, out1, size);
    }

    if(jm_delay.enable == 1)
    {
        jm_delay.processBlock(in1, out1, size);
    }

    if(jm_freeverb.enable == 1)
    {
        jm_freeverb.processBlock(in1, out1, size);
    }


    for(size_t i = 0; i < size; i++)
    {
        // Process looper
        float temp = 0;
        /*if(LooperParam.en == 1)
        {
            hw.SetLed(looper.recording);
            looper.process(out1[i], temp);
            if(armLooper == 1)
            {
                looper.record();
                armLooper = 0;
            }


            out1[i] = temp;
        }*/
        //temp = looper.Process(out1[i], 0.0f);
        //out1[i] = temp;
        if(drum_player.enable == 1)
        {
            temp    = out1[i];
            temp    = drum_player.Process(out1[i]);
            out1[i] = temp;
            // temp = out1[i];
            // out1[i] += looper.Process(temp, 0.0f);
        }

        envRMS    = env.Process(fabsf(out1[i]));
        out[0][i] = out1[i] * MasterVol;
        out[1][i] = out1[i] * MasterVol;
    }


    cpuMeter.OnBlockEnd();
}
int main(void)
{
    hw.Init(true);
    hw.StartLog(0);

    sw1.Init(hw.GetPin(27),
             0.0f,
             sw1.TYPE_MOMENTARY,
             sw1.POLARITY_INVERTED,
             sw1.PULL_UP);
    sw2.Init(hw.GetPin(25),
             0.0f,
             sw2.TYPE_MOMENTARY,
             sw2.POLARITY_INVERTED,
             sw2.PULL_UP);


    uint8_t result_sd = 0;
    sd_cfg.speed      = SdmmcHandler::Speed::VERY_FAST; // switch to standard?
    sd_cfg.width      = SdmmcHandler::BusWidth::BITS_4;
    result_sd         = (uint8_t)sdcard.Init(sd_cfg);
    result_sd         = fsi.Init(FatFSInterface::Config::MEDIA_SD);
    result_sd         = f_mount(&fsi.GetSDFileSystem(), "/", 1);

    if(!result_sd)
        BlinkLed(3, 200);

    ReadWrirtIR("Mesa.ir", Mesa, FIR_COEFFS_COUNT, 1);
    ReadWrirtIR("TwinReverb.ir", TwinReverb, FIR_COEFFS_COUNT, 1);
    ReadWrirtIR("Marshall.ir", Marshall, FIR_COEFFS_COUNT, 1);
    ReadWrirtIR("Vox.ir", Vox, FIR_COEFFS_COUNT, 1);
    ReadWrirtIR("Orange.ir", Orange, FIR_COEFFS_COUNT, 1);
    ReadWrirtIR("Friedman.ir", Friedman, FIR_COEFFS_COUNT, 1);
    ReadWrirtIR("EVH.ir", EVH, FIR_COEFFS_COUNT, 1);
    ReadWrirtIR("Bassman.ir", Bassman, FIR_COEFFS_COUNT, 1);
    ReadWrirtIR("metro1.sam", metronome1, 24000, 1);
    ReadWrirtIR("metro2.sam", metronome2, 24000, 1);

    int samples = 0;
    samples     = ReadWav("0:/Drums/open_hat.wav", hihat_open1, 24000);
    samples     = ReadWav("0:/Drums/closed_hat.wav", hihat_close1, 24000);
    samples     = ReadWav("0:/Drums/snare.wav", snare1, 24000);
    samples     = ReadWav("0:/Drums/kick.wav", kick1, 24000);
    samples     = ReadWav("0:/Drums/tom1.wav", tom1, 24000);
    samples     = ReadWav("0:/Drums/tom2.wav", tom2, 24000);
    samples     = ReadWav("0:/Drums/tom3.wav", tom3, 24000);
    samples     = ReadWav("0:/Drums/ride.wav", cymbal1, 24000);
    samples     = ReadWav("0:/Drums/crash.wav", ride1, 24000);


    drum_player.Init(sample_rate);
    drum_player.samples_[0] = &kick1[0];
    drum_player.samples_[1] = &snare1[0];
    drum_player.samples_[3] = &hihat_open1[0];
    drum_player.samples_[2] = &hihat_close1[0];
    drum_player.samples_[4] = &tom1[0];
    drum_player.samples_[5] = &tom2[0];
    drum_player.samples_[6] = &tom3[0];
    drum_player.samples_[8] = &cymbal1[0];
    drum_player.samples_[7] = &ride1[0];
    drum_player.samples_[9] = &hihat_close1[0];


    if(drum_player.LoadFromSD("0:/DrumMidi/blues1.mid"))
    {
        hw.PrintLine("MIDI loaded");
    }
    else
    {
        hw.PrintLine("MIDI not loaded");
    }

    BlinkLed(5, 100);

    System::Delay(100);

    looper.Init();
    looper.ClearMem();

    //Initialize utilities
    noise.Init();
    noise.SetAmp(0.1f);

    testTone.Init(sample_rate);
    testTone.SetWaveform(Oscillator::WAVE_SIN);
    testTone.SetFreq(440.0f);
    testTone.SetAmp(0.1f);

    jm_overdrive.init();
    jm_overdrive.gain_factor = 1.0f;
    jm_distortion.init();
    jm_distortion.gain_factor = 1.0f;
    jm_delay.init();
    jm_fir.init();
    jm_autowah.init(sample_rate);
    jm_equalizer.init();
    jm_compressor.init();
    jm_noisegate.init();
    jm_tremolo.init();
    jm_phaser.init();
    jm_flanger.init();
    jm_chorus.init();
    jm_pitchshifter.init();
    jm_freeverb.init();
    jm_harmonizer.init();

    //InitPresets();

    env.Init();
    env.SetFilterMode(OnePole::FILTER_MODE_LOW_PASS);
    env.SetFrequency(15.0f / sample_rate);

    //Setup UART


    UARTconfig.baudrate      = 115200;
    UARTconfig.periph        = UartHandler::Config::Peripheral::USART_1;
    UARTconfig.stopbits      = UartHandler::Config::StopBits::BITS_1;
    UARTconfig.parity        = UartHandler::Config::Parity::NONE;
    UARTconfig.mode          = UartHandler::Config::Mode::TX_RX;
    UARTconfig.wordlength    = UartHandler::Config::WordLength::BITS_8;
    UARTconfig.pin_config.rx = {DSY_GPIOB, 15}; // (USART_1 RX) Daisy pin 15
    UARTconfig.pin_config.tx = {DSY_GPIOB, 14}; // (USART_1 TX) Daisy pin 14

    uart.Init(UARTconfig);


    //UART DMA

    uart.DmaReceive(rx_buff, BytestRecv, NULL, RestartUartRx, NULL);
    //uart.DmaTransmit(bfr, 5, NULL, RestartUart, NULL);


    TIMconfig.periph     = TimerHandle::Config::Peripheral::TIM_5;
    TIMconfig.dir        = TimerHandle::Config::CounterDir::UP;
    TIMconfig.enable_irq = 1;
    TIMconfig.period     = 1000;
    timer.Init(TIMconfig);
    timer.SetCallback(TimerCallback, nullptr);
    timer.SetPrescaler(10000);
    timer.Start();

    //updatePreset(Preset_Bypass);

    // Initialize IR measurement
    IRnoise.Init();
    IRnoise.SetAmp(1);

    hw.PrintLine("LoadingWeights");
    rtneural_wavenet.prepare(256);

    int readWeights = parse_nam_weights(
        "0:/NAM/Ola Satan Model 50 nano.nam", BossOD3_weights_data, 1024);
    load_nano_weights(BossOD3_weights_data);
    hw.PrintLine("Read: %d weights", readWeights);
    System::Delay(500);
    num_nam_files_found = browse_nam_files(nam_file_list);
    hw.PrintLine("Found %d .nam files in NAM", num_nam_files_found);
    hw.PrintLine("Filename: %s", nam_file_list[0]);
    hw.PrintLine("Filename: %s", nam_file_list[1]);
    hw.PrintLine("Filename: %s", nam_file_list[2]);
    hw.PrintLine("Filename: %s", nam_file_list[3]);

    // [NEW] Broadcast List on Startup
    SendNamList();
    System::Delay(100);

    rtneural_wavenet.prewarm();
    num_ir_files_found = browse_ir_files(ir_file_list);
    hw.PrintLine("Found %d .wav files in IR", num_ir_files_found);
    hw.PrintLine("Filename: %s", ir_file_list[0]);
    hw.PrintLine("Filename: %s", ir_file_list[1]);
    hw.PrintLine("Filename: %s", ir_file_list[2]);
    hw.PrintLine("Filename: %s", ir_file_list[3]);

    SendIRList();

    System::Delay(100);

    hw.SetAudioSampleRate(daisy::SaiHandle::Config::SampleRate::SAI_48KHZ);
    hw.SetAudioBlockSize(BLOCK_SIZE); // 256 for smbpitchshift
    cpuMeter.Init(hw.AudioSampleRate(), hw.AudioBlockSize());
    hw.StartAudio(AudioCallback);


    while(1)
    {
        if(updtParam)
        {
            UpdateParam(rx_buff);

            hw.PrintLine("%c%c%c%c,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d",
                         rx_buff[0],
                         rx_buff[1],
                         rx_buff[2],
                         rx_buff[3],
                         rx_buff[4],
                         rx_buff[5],
                         rx_buff[6],
                         rx_buff[7],
                         rx_buff[8],
                         rx_buff[9],
                         rx_buff[10],
                         rx_buff[11],
                         rx_buff[12],
                         rx_buff[13],
                         rx_buff[14],
                         rx_buff[15],
                         rx_buff[16]);
            updtParam = false;
        }
        uint32_t now = System::GetNow();
        if(now - last_action_time >= interval_ms)
        {
            /*if(util_tuner_enabled)
            {
                jm_harmonizer.calc_pitch();
                sendTunerFreq(jm_harmonizer.frq);
            }*/
            float  avgLoad = cpuMeter.GetAvgCpuLoad();
            size_t bSize   = hw.AudioBlockSize();
            /*hw.PrintLine(
                "CPU Load: %2.2f%% , Audio Block Size: %u, Signal Level: "
                "%3.3f%",
                avgLoad * 100.0f,
                bSize,
                envRMS * 1000.0);*/
            sendDataPacket("LOAD", &avgLoad, sizeof(float));
            last_action_time = now;
            /*hw.PrintLine(
                "Looper: State=%d (0:Idle,1:Wait,2:Rec,3:Play), PendingAct=%d, "
                "Layer=%d, Pos=%d",
                looper.state,
                looper.pending_action,
                looper.cur_layer,
                looper.cur_pos);*/
           
            //sendDataPacket("NAML",  &avgLoad, sizeof(float));
        }
        if(now - last_action_time2 >= 500)
        {
            /*hw.PrintLine(
                "Freq: %3.3f Hz, Closest Note Index: %d, Semitones1: %f, Mode: "
                "%f, Scale: %f",
                jm_harmonizer.frq,
                jm_harmonizer.closeIndex,
                jm_harmonizer.Semitones1,
                jm_harmonizer.mode,
                jm_harmonizer.scale);*/

            last_action_time2 = now;
        }


        // Update file name and load the MIDI in the main while(1) loop
        // Only way it works !?!
        if(strcmp(filepath, currentfilepath) != 0)
        {
            drum_player.LoadFromSD(filepath);
            strcpy(currentfilepath, filepath);
        }

        if(updateNAM)
        {
            hw.PrintLine("Loaded file %s", nam_file_list[NAM_FileIndex]);
            parse_nam_weights(
                nam_file_list[NAM_FileIndex], BossOD3_weights_data, 1024);
            updateNAM      = false;
            weights_loaded = false;
        }

        if(updateIR)
        {
            hw.PrintLine("Loaded file %s", ir_file_list[IR_FileIndex]);
            ReadWav(ir_file_list[IR_FileIndex], loaded_ir, 2048);
            if(jm_fir.type == 0)
            {
                jm_fir.setImpulseResponse(loaded_ir, jm_fir.firLength, true);
            }
            if(jm_fir.type == 1)
            {
                cab_sim.Init(sample_rate);
                cab_sim.LoadExternalIR(loaded_ir, jm_fir.firLength);
            }

            updateIR = false;
        }

        if(jm_fir.changeIR)
        {
            if(jm_fir.type == 0)
            {
                switch(static_cast<int>(jm_fir.model))
                {
                    case 1:
                        jm_fir.setImpulseResponse(
                            Fender_65, jm_fir.firLength, false);
                        break;
                    case 2:
                        jm_fir.setImpulseResponse(
                            TwinReverb, jm_fir.firLength, false);
                        break;
                    case 3:
                        jm_fir.setImpulseResponse(
                            Marshall, jm_fir.firLength, false);
                        break;
                    case 4:
                        jm_fir.setImpulseResponse(
                            Orange, jm_fir.firLength, false);
                        break;
                    case 5:
                        jm_fir.setImpulseResponse(
                            Mesa, jm_fir.firLength, false);
                        break;
                    case 6:
                        jm_fir.setImpulseResponse(EVH, jm_fir.firLength, false);
                        break;
                    case 7:
                        jm_fir.setImpulseResponse(
                            Friedman, jm_fir.firLength, false);
                        break;
                    case 8:
                        jm_fir.setImpulseResponse(Vox, jm_fir.firLength, false);
                        break;
                    case 9:
                        jm_fir.setImpulseResponse(
                            Bassman, jm_fir.firLength, false);
                        break; // Bassman
                    default:
                        jm_fir.setImpulseResponse(
                            Fender_65, jm_fir.firLength, true);
                        break;
                }
            }
            if(jm_fir.type == 1)
            {
                cab_sim.Init(sample_rate);
                switch(static_cast<int>(jm_fir.model))
                {
                    case 1:
                        cab_sim.LoadExternalIR(Fender_65, jm_fir.firLength);
                        break;
                    case 2:
                        cab_sim.LoadExternalIR(TwinReverb, jm_fir.firLength);
                        break;
                    case 3:
                        cab_sim.LoadExternalIR(Marshall, jm_fir.firLength);
                        break;
                    case 4:
                        cab_sim.LoadExternalIR(Orange, jm_fir.firLength);
                        break;
                    case 5:
                        cab_sim.LoadExternalIR(Mesa, jm_fir.firLength);
                        break;
                    case 6:
                        cab_sim.LoadExternalIR(EVH, jm_fir.firLength);
                        break;
                    case 7:
                        cab_sim.LoadExternalIR(Friedman, jm_fir.firLength);
                        break;
                    case 8:
                        cab_sim.LoadExternalIR(Vox, jm_fir.firLength);
                        break;
                    case 9:
                        cab_sim.LoadExternalIR(Bassman, jm_fir.firLength);
                        break; // Bassman
                    default:
                        cab_sim.LoadExternalIR(Fender_65, jm_fir.firLength);
                        break;
                }
            }

            jm_fir.changeIR = false;
        }

        sw1.Debounce();
        sw2.Debounce();

        //hw.PrintLine("%1.3f",envRMS*1000.0f);

        if(sw1.FallingEdge() || comMIDI == 0)
        {
            sw1_pressed = 1;
            hw.PrintLine("SW1 Pressed");
            looper.TriggerUndo(); // .undo();
            if(looper.cur_layer == 0)
            {
                looper.TriggerStop();
                looper.ClearMem();
            }
            comMIDI = 255;
        }

        if(sw2.FallingEdge() || comMIDI == 1)
        {
            sw2_pressed = 1;
            hw.PrintLine("SW2 Pressed");
            //if(jm_drummer.enable == 0)
            looper.TriggerRecord();
            //else armLooper = 1;

            //hw.SetLed(looper.recording);

            //if ( ==0) {armLooper = 1; hw.PrintLine("arm=1");}
            //if (armLooper ==2) {armLooper = 0; hw.PrintLine("arm=0");}
            comMIDI = 255;
        }

        /*if(ir_measurement.IsMeasurementComplete())
        {
            // Measurement complete - access results
             const char* progress = ir_measurement.GetProgress();
            //float        snr     = ir_measurement.GetSNREstimate();
            ir_measurement.ExportIR(
                Bassman,
                1024); // Here you could save to SD card, send over serial, etc.
            //hw.PrintLine("SNR: %1.3f%", snr);
            //System::Delay(5000); // Wait 5 seconds
            //ir_measurement.StartMeasurement(10); // Start again
        }*/
        //hw.PrintLine(progress);
        if(looper.state == looper.STATE_RECORDING)
        {
            hw.SetLed(1);
        }
        else if(looper.state == looper.STATE_PLAYING)
        {
            hw.SetLed(0);
        }
        else
        {
            hw.SetLed(0);
        }
        System::Delay(1);
    }
}

void BlinkLed(int N, int Delay)
{
    for(int i = 0; i < N; i++)
    {
        hw.SetLed(1);
        System::Delay(Delay);
        hw.SetLed(0);
        System::Delay(Delay);
    }
}

// Function to write each effect
void WriteEffect(char* Name, uint8_t* data)
{
    f_printf(&SDFile, "%s\n", Name);
    for(int i = 0; i < 17; i++)
    {
        f_printf(&SDFile, "%d\n", data[i]);
    }
}


void ReadWrirtIR(const char* FileName, float* IR, int count, bool isFir)
{
    UINT byteswritten = 0;
    if(isFir && f_open(&SDFile, FileName, FA_READ) == FR_OK)
    {
        for(int i = 0; i < count; i++)
        {
            f_read(&SDFile, a.bytes, 4, &byteswritten);
            IR[i] = a.number;
        }

        f_close(&SDFile);
        return;
    }

    if(!isFir
       && f_open(&SDFile, FileName, FA_WRITE | FA_CREATE_ALWAYS) == FR_OK)
    {
        // Write preset values in a readable format
        f_printf(&SDFile, "Preset Data:\n");
        f_close(&SDFile);
        return;
    }
}


void CheckForLongPress()
{
    // Debounce the switches to ensure stable readings
    sw1.Debounce();
    sw2.Debounce();

    // Get the elapsed time since the last call.
    // In a main loop, you might use a timer. In an audio callback, it's 1.0f / sample_rate.
    // For simplicity, we'll assume a call rate matching the switch update rate.


    // --- Switch 1 Timer ---
    if(sw1.Pressed())
    {
        sw1_held_time += kDeltaTimeSeconds;
    }
    else
    {
        sw1_held_time = 0.0f; // Reset if not pressed
    }

    // --- Switch 2 Timer ---
    if(sw2.Pressed())
    {
        sw2_held_time += kDeltaTimeSeconds;
    }
    else
    {
        sw2_held_time = 0.0f; // Reset if not pressed
    }

    // --- Check for Trigger Condition ---
    if(sw1_held_time >= kLongPressDurationSeconds
       && sw2_held_time >= kLongPressDurationSeconds)
    {
        // Both buttons have been held long enough, trigger the function
        System::ResetToBootloader(
            System::BootloaderMode::DAISY_INFINITE_TIMEOUT);

        // Reset timers to prevent the function from being called again until buttons are released and re-pressed
        sw1_held_time = 0.0f;
        sw2_held_time = 0.0f;
    }
}
