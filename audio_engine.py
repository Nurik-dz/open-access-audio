"""
Open-Access Audio Engine.

Used two ways:
  * CLI (what the web app does): ``python audio_engine.py <action> [args]`` prints a
    single JSON object on stdout. Run it with no arguments to see usage.
  * HTTP (optional): ``uvicorn audio_engine:app`` serves a small FastAPI layer.
"""
import os
import sys
import json
import uuid
import shutil
import asyncio
import subprocess
import requests
import urllib.parse
import contextlib
import numpy as np
import scipy.io.wavfile as wavfile
import scipy.signal as signal
from typing import Optional, Tuple

# Upper bound for any single ffmpeg invocation (seconds).
FFMPEG_TIMEOUT = int(os.environ.get("FFMPEG_TIMEOUT_SEC", "180"))
# Longest stretch of reference audio analysed for pitch/timbre (seconds).
MAX_ANALYSIS_SECONDS = 30

# Pydantic & FastAPI are only needed for the optional HTTP layer. Importing FastAPI
# costs noticeable start-up time, and the web app spawns a fresh process per request,
# so skip it when running as a CLI.
try:
    from pydantic import BaseModel
except ImportError:
    class BaseModel:
        def __init__(self, **kwargs):
            for k, v in kwargs.items():
                setattr(self, k, v)

FastAPI = BackgroundTasks = HTTPException = FileResponse = None
if __name__ != "__main__":
    try:
        from fastapi import FastAPI, BackgroundTasks, HTTPException
        from fastapi.responses import FileResponse
    except ImportError:
        pass

# Suppress Gradio client info banners from contaminating stdout
@contextlib.contextmanager
def suppress_stdout_stderr():
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    try:
        sys.stdout = sys.stderr
        yield
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

with suppress_stdout_stderr():
    try:
        from gradio_client import Client, handle_file
    except Exception:
        Client = None
        handle_file = None

TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_audio")
os.makedirs(TEMP_DIR, exist_ok=True)

def cleanup_file(path: str):
    try:
        if path and os.path.exists(path):
            os.remove(path)
    except Exception as e:
        print(f"[Warning] Failed to remove {path}: {e}", file=sys.stderr)

def normalize_to_pcm_wav(input_file: str, sample_rate: int = 24000) -> str:
    """
    Converts any input audio file (WebM, Opus, MP3, M4A, OGG, AAC, FLAC, WAV)
    to a guaranteed valid 16-bit PCM Mono WAV file.
    """
    output_wav = os.path.join(TEMP_DIR, f"norm_{uuid.uuid4().hex}.wav")
    try:
        conv_res = subprocess.run(
            [
                'ffmpeg', '-y', '-v', 'error',
                '-i', input_file,
                '-ar', str(sample_rate),
                '-ac', '1',
                '-c:a', 'pcm_s16le',
                output_wav
            ],
            capture_output=True,
            text=True,
            timeout=FFMPEG_TIMEOUT
        )
    except FileNotFoundError:
        raise RuntimeError("FFmpeg is not installed or not on PATH.")
    except subprocess.TimeoutExpired:
        cleanup_file(output_wav)
        raise RuntimeError("FFmpeg audio normalization timed out.")
    if conv_res.returncode != 0 or not os.path.exists(output_wav) or os.path.getsize(output_wav) == 0:
        cleanup_file(output_wav)
        raise RuntimeError(f"FFmpeg audio normalization failed: {conv_res.stderr.strip() or 'Invalid audio data'}")
    return output_wav

def extract_acoustic_profile(wav_path: str):
    """
    Analyzes uploaded audio to extract fundamental pitch (F0), spectral centroid (brightness/timbre),
    energy envelope, speaking pace, and gender classification.
    """
    sr, data = wavfile.read(wav_path)
    if data.ndim > 1:
        data = data[:, 0]
    # Pitch tracking is O(frames * window^2); cap the analysed span so a long
    # upload cannot stall the request.
    data = data[: int(sr * MAX_ANALYSIS_SECONDS)]
    data = data.astype(np.float32)
    max_val = np.max(np.abs(data)) if len(data) else 0.0
    if max_val > 0:
        data = data / max_val

    duration_sec = len(data) / float(sr)
    frame_len = int(sr * 0.03)  # 30ms window
    hop_len = int(sr * 0.01)    # 10ms step
    num_frames = (len(data) - frame_len) // hop_len

    if num_frames <= 0 or duration_sec < 0.2:
        # Too short to measure: report neutral defaults and flag them as such.
        return {
            'pitch_hz': 150.0,
            'pitch_label': '150 Hz (Default - sample too short to measure)',
            'centroid_hz': 1800.0,
            'timbre': 'Balanced Natural',
            'donor_voice': 'en-US-AndrewMultilingualNeural',
            'pitch_offset': '+0Hz',
            'rate_offset': '+0%',
            'eq_gain_db': 0.0,
            'gender': 'neutral',
            'measured': False
        }

    frames = np.array([data[i * hop_len : i * hop_len + frame_len] for i in range(num_frames)])
    rms = np.sqrt(np.mean(frames ** 2, axis=1))
    speech_mask = rms > (np.max(rms) * 0.08)

    pitches = []
    min_lag = int(sr / 450)  # max 450 Hz
    max_lag = int(sr / 65)   # min 65 Hz

    for frame in frames[speech_mask]:
        frame_win = frame * np.hanning(len(frame))
        corr = np.correlate(frame_win, frame_win, mode='full')
        corr = corr[len(corr) // 2:]
        if len(corr) > max_lag:
            peak_lag = min_lag + np.argmax(corr[min_lag:max_lag])
            if corr[peak_lag] > 0.25 * corr[0]:
                pitches.append(sr / peak_lag)

    median_pitch = float(np.median(pitches)) if len(pitches) >= 3 else 150.0
    median_pitch = max(70.0, min(400.0, median_pitch))

    # Spectral centroid calculation
    magnitudes = np.abs(np.fft.rfft(data))
    freqs = np.fft.rfftfreq(len(data), 1.0 / sr)
    spectral_centroid = float(np.sum(freqs * magnitudes) / (np.sum(magnitudes) + 1e-10))

    if median_pitch < 140:
        gender = 'male'
        donor_voice = 'en-US-AndrewMultilingualNeural' if median_pitch >= 115 else 'en-US-BrianMultilingualNeural'
        pitch_diff = int(median_pitch - 130)
        pitch_offset = f"{pitch_diff:+d}Hz"
        pitch_label = f"{int(median_pitch)} Hz (Deep Resonant Voice)"
    elif median_pitch > 190:
        gender = 'female'
        donor_voice = 'en-US-AvaMultilingualNeural' if median_pitch <= 240 else 'en-US-EmmaMultilingualNeural'
        pitch_diff = int(median_pitch - 215)
        pitch_offset = f"{pitch_diff:+d}Hz"
        pitch_label = f"{int(median_pitch)} Hz (High Melodic Voice)"
    else:
        gender = 'neutral'
        donor_voice = 'en-US-AndrewMultilingualNeural'
        pitch_diff = int(median_pitch - 165)
        pitch_offset = f"{pitch_diff:+d}Hz"
        pitch_label = f"{int(median_pitch)} Hz (Mid-Tone Warm Voice)"

    if spectral_centroid > 2800:
        timbre = "Bright & Crisp (High Formant Resonance)"
        eq_gain = +2.5
    elif spectral_centroid < 1500:
        timbre = "Warm & Mellow (Chest Resonance)"
        eq_gain = -2.0
    else:
        timbre = "Balanced & Clear (Natural Dispersion)"
        eq_gain = 0.0

    return {
        'pitch_hz': round(median_pitch, 1),
        'pitch_label': pitch_label,
        'centroid_hz': round(spectral_centroid, 1),
        'timbre': timbre,
        'donor_voice': donor_voice,
        'pitch_offset': pitch_offset,
        'rate_offset': '+0%',
        'eq_gain_db': eq_gain,
        'gender': gender,
        'measured': True
    }

async def run_tts_async(text: str, voice: str = "en-US-AndrewMultilingualNeural", rate: str = "+0%", pitch: str = "+0Hz", volume: str = "+0%", output_path: str = None):
    # Use the edge_tts API directly rather than shelling out to its CLI: argparse
    # would treat text beginning with "-" as an option, and we save a process spawn.
    import edge_tts

    if not output_path:
        output_path = os.path.join(TEMP_DIR, f"tts_{uuid.uuid4().hex}.mp3")

    communicate = edge_tts.Communicate(
        text=text,
        voice=voice or "en-US-AndrewMultilingualNeural",
        rate=rate or "+0%",
        pitch=pitch or "+0Hz",
        volume=volume or "+0%"
    )
    await communicate.save(output_path)

    if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        raise RuntimeError("TTS generation resulted in empty output file.")

    return output_path

def run_stt(input_file: str, language: str = "en-US"):
    import speech_recognition as sr  # lazy: only STT needs it

    normalized_wav = None
    try:
        normalized_wav = normalize_to_pcm_wav(input_file, sample_rate=16000)
        r = sr.Recognizer()
        with sr.AudioFile(normalized_wav) as source:
            r.adjust_for_ambient_noise(source, duration=0.2)
            audio_data = r.record(source)
            try:
                text = r.recognize_google(audio_data, language=language)
            except sr.UnknownValueError:
                text = ""
            except sr.RequestError as re:
                raise RuntimeError(f"Google Web Speech API error: {str(re)}")
        
        return text
    finally:
        cleanup_file(normalized_wav)

def synthesize_acoustic_clone(normalized_ref_wav: str, text_to_speak: str, output_path: str, pitch_adj_hz: int = 0, timbre_adj_db: float = 0.0):
    profile = extract_acoustic_profile(normalized_ref_wav)
    total_pitch_offset = profile['pitch_offset']
    pitch_adj_hz = int(max(-100, min(100, pitch_adj_hz)))
    timbre_adj_db = float(max(-12.0, min(12.0, timbre_adj_db)))
    if pitch_adj_hz != 0:
        current_offset_val = int(profile['pitch_offset'].replace('Hz', '').replace('+', ''))
        new_offset = current_offset_val + pitch_adj_hz
        total_pitch_offset = f"+{new_offset}Hz" if new_offset >= 0 else f"{new_offset}Hz"

    temp_mp3 = os.path.join(TEMP_DIR, f"synth_raw_{uuid.uuid4().hex}.mp3")
    
    asyncio.run(run_tts_async(
        text=text_to_speak,
        voice=profile['donor_voice'],
        rate=profile['rate_offset'],
        pitch=total_pitch_offset,
        output_path=temp_mp3
    ))

    eq_gain = profile['eq_gain_db'] + timbre_adj_db
    filters = []
    
    if profile['pitch_hz'] < 130:
        filters.append("equalizer=f=180:t=q:w=1.0:g=+2.5")
    elif profile['pitch_hz'] > 200:
        filters.append("equalizer=f=220:t=q:w=1.2:g=-1.5")

    if eq_gain != 0.0:
        filters.append(f"equalizer=f=3200:t=q:w=1.5:g={eq_gain:.1f}")

    filter_str = ",".join(filters) if filters else "anull"

    conv_cmd = [
        'ffmpeg', '-y', '-v', 'error',
        '-i', temp_mp3,
        '-af', filter_str,
        '-ar', '24000',
        '-ac', '1',
        output_path
    ]
    try:
        conv = subprocess.run(conv_cmd, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT)
    except subprocess.TimeoutExpired:
        raise RuntimeError("Acoustic voice synthesis timed out in FFmpeg.")
    finally:
        cleanup_file(temp_mp3)

    if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
        raise RuntimeError(f"Acoustic voice synthesis failed to produce output. {conv.stderr.strip()}")

    return output_path, profile

def run_clone(reference_audio_path: str, text_to_speak: str, ref_text: str = "", hf_token: str = None, pitch_adj: int = 0, timbre_adj: float = 0.0, output_path: str = None):
    if not output_path:
        output_path = os.path.join(TEMP_DIR, f"clone_{uuid.uuid4().hex}.wav")
    
    normalized_ref_wav = None
    remote_error = None
    try:
        normalized_ref_wav = normalize_to_pcm_wav(reference_audio_path, sample_rate=24000)
        profile = extract_acoustic_profile(normalized_ref_wav)

        if not ref_text or not ref_text.strip():
            try:
                detected_ref = run_stt(normalized_ref_wav)
                if detected_ref and detected_ref.strip():
                    ref_text = detected_ref.strip()
            except Exception:
                pass
        
        if not ref_text or not ref_text.strip():
            ref_text = "Audio reference acoustic speech sample."

        if hf_token and Client is not None:
            try:
                with suppress_stdout_stderr():
                    client = Client("mrfakename/E2-F5-TTS", token=hf_token.strip())
                    result = client.predict(
                        ref_audio=handle_file(normalized_ref_wav),
                        ref_text=ref_text,
                        gen_text=text_to_speak,
                        remove_silence=True,
                        api_name="/predict"
                    )
                src_path = result[0] if isinstance(result, (list, tuple)) else result
                if isinstance(src_path, dict) and "video" in src_path:
                    src_path = src_path["video"]
                elif isinstance(src_path, dict) and "value" in src_path:
                    src_path = src_path["value"]
                    
                shutil.copy(str(src_path), output_path)
                profile['method'] = 'Zero-Shot Diffusion (F5-TTS)'
                return output_path, ref_text, profile
            except Exception as e_hf:
                remote_error = str(e_hf)[:300]
                print(f"[Clone Notice] Remote GPU space note: {e_hf}, using local acoustic cloning engine...", file=sys.stderr)

        out_path, profile = synthesize_acoustic_clone(
            normalized_ref_wav=normalized_ref_wav,
            text_to_speak=text_to_speak,
            output_path=output_path,
            pitch_adj_hz=pitch_adj,
            timbre_adj_db=timbre_adj
        )
        # Be explicit: the local path picks the closest stock Edge voice and applies
        # pitch/EQ. It is a voice *match*, not a zero-shot clone.
        profile['method'] = 'Acoustic Voice Match (stock voice + pitch/EQ)'
        if remote_error:
            profile['remote_error'] = remote_error
        return out_path, ref_text, profile

    finally:
        cleanup_file(normalized_ref_wav)

def generate_procedural_foley_fallback(prompt: str, duration: float, output_path: str):
    """
    High-fidelity multi-model procedural audio synthesizer for sound effects and environmental soundscapes.
    Synthesizes rich acoustic transients, physical body resonances, frequency sweeps, noise filtering, and harmonic textures.
    """
    sr = 24000
    duration = max(0.5, min(duration, 30.0))
    total_samples = int(sr * duration)
    t = np.linspace(0, duration, total_samples, endpoint=False)
    prompt_lower = prompt.lower()
    
    data = np.zeros(total_samples, dtype=np.float64)

    # 1. Foley & Physical Impacts: Knock, Door, Wood, Hit, Punch, Thud
    if any(k in prompt_lower for k in ['knock', 'door', 'wood', 'table', 'slam']):
        # Multi-strike wooden impact with resonant cavity modes
        num_knocks = 2 if ('double' in prompt_lower or 'knocks' in prompt_lower) else 1
        intervals = [0.0, 0.28] if num_knocks == 2 else [0.0]
        for start_t in intervals:
            idx_start = int(start_t * sr)
            if idx_start < total_samples:
                sub_len = total_samples - idx_start
                sub_t = t[:sub_len]
                # Body modes (80Hz, 160Hz, 320Hz)
                thump = (
                    0.55 * np.sin(2 * np.pi * 78.0 * sub_t) * np.exp(-18.0 * sub_t) +
                    0.30 * np.sin(2 * np.pi * 165.0 * sub_t) * np.exp(-24.0 * sub_t) +
                    0.15 * np.sin(2 * np.pi * 330.0 * sub_t) * np.exp(-32.0 * sub_t)
                )
                noise_burst = (np.random.rand(sub_len) * 2 - 1) * np.exp(-35.0 * sub_t) * 0.35
                data[idx_start:] += (thump + noise_burst)

    elif any(k in prompt_lower for k in ['punch', 'hit', 'smash', 'thud', 'impact', 'strike']):
        # Heavy transient sub-bass punch (pitch drops 160Hz -> 45Hz)
        pitch_curve = 45.0 + 115.0 * np.exp(-25.0 * t)
        phase = 2 * np.pi * np.cumsum(pitch_curve) / sr
        sub_body = np.sin(phase) * np.exp(-7.0 * t)
        # Slap crack transient
        slap = (np.random.randn(total_samples)) * np.exp(-40.0 * t) * 0.5
        data = sub_body * 0.8 + slap * 0.3

    # 2. Footsteps / Walking
    elif any(k in prompt_lower for k in ['footstep', 'walk', 'step', 'running']):
        step_interval = 0.5
        for s_idx in range(int(duration / step_interval)):
            st = s_idx * step_interval
            idx = int(st * sr)
            if idx < total_samples:
                slen = min(total_samples - idx, int(0.25 * sr))
                st_arr = t[:slen]
                heel = np.sin(2 * np.pi * (90 + (s_idx % 2) * 15) * st_arr) * np.exp(-22.0 * st_arr)
                crunch = (np.random.rand(slen) * 2 - 1) * np.exp(-30.0 * st_arr) * 0.4
                data[idx:idx + slen] += (heel * 0.6 + crunch * 0.4)

    # 3. Sci-Fi: Laser, Blaster, Pew, Plasma, Energy, Cyber
    elif any(k in prompt_lower for k in ['laser', 'blaster', 'pew', 'plasma', 'ray', 'beam', 'phaser']):
        # Exponential pitch drop chirp (2800Hz down to 80Hz) + FM modulation
        f_start = 2600.0
        f_end = 90.0
        freq_env = f_end + (f_start - f_end) * np.exp(-12.0 * t)
        fm_mod = 0.3 * np.sin(2 * np.pi * 320.0 * t)
        phase = 2 * np.pi * np.cumsum(freq_env * (1.0 + fm_mod)) / sr
        amp_env = np.exp(-4.5 * t)
        data = np.sin(phase) * amp_env

    # 4. Explosions, Bomb, Blast, Thunder
    elif any(k in prompt_lower for k in ['explosion', 'bomb', 'blast', 'boom', 'detonation', 'thunder', 'cannon']):
        # Initial crackle transient
        crackle = (np.random.randn(total_samples)) * np.exp(-15.0 * t) * 0.6
        # Low frequency rumble (35Hz-80Hz filtered)
        sub_rumble = np.random.randn(total_samples)
        b, a = signal.butter(2, 0.03, btype='low')
        sub_rumble = signal.lfilter(b, a, sub_rumble) * (np.exp(-1.5 * t) + 0.3 * np.exp(-0.4 * t))
        # Deep sine sub drop
        sub_drop = np.sin(2 * np.pi * (35.0 + 45.0 * np.exp(-2.0 * t)) * t) * np.exp(-2.0 * t)
        data = crackle * 0.4 + sub_rumble * 0.9 + sub_drop * 0.5

    # 5. Bells, Chimes, Magic, Crystal, Sparkle, Ding
    elif any(k in prompt_lower for k in ['bell', 'chime', 'ding', 'magic', 'sparkle', 'crystal', 'celestial', 'harp']):
        base_notes = [587.33, 880.0, 1174.66, 1760.0, 2349.32] # D5, A5, D6, A6, D7
        for i, freq in enumerate(base_notes):
            decay = 1.8 + i * 0.6
            weight = 0.45 / (1 + i * 0.5)
            # Inharmonic overtone shift for crystal shimmer
            inharm = freq * (1.0 + 0.003 * i)
            data += weight * np.sin(2 * np.pi * inharm * t) * np.exp(-decay * t)
        # Add subtle shimmer chorus modulation
        shimmer = np.sin(2 * np.pi * 6.0 * t) * 0.08
        data = data * (1.0 + shimmer)

    # 6. UI Clicks, Switch, Button, Clock Tick
    elif any(k in prompt_lower for k in ['click', 'tick', 'clock', 'switch', 'button', 'tap']):
        if 'clock' in prompt_lower or 'tick' in prompt_lower:
            # Periodic 1Hz ticking
            for sec in range(int(duration)):
                idx = int(sec * sr)
                if idx < total_samples:
                    slen = min(total_samples - idx, int(0.08 * sr))
                    st_arr = t[:slen]
                    f_tick = 1400.0 if sec % 2 == 0 else 1050.0
                    data[idx:idx + slen] += np.sin(2 * np.pi * f_tick * st_arr) * np.exp(-70.0 * st_arr)
        else:
            # Single sharp UI click
            data = np.sin(2 * np.pi * 1250.0 * t) * np.exp(-80.0 * t) + (np.random.rand(total_samples) * 2 - 1) * np.exp(-120.0 * t) * 0.2

    # 7. Deep Underwater, Submarine, Hydrothermal Vents, Sonar, Deep Ocean Abyss
    elif any(k in prompt_lower for k in ['underwater', 'submarine', 'sonar', 'hydrothermal', 'vent', 'abyss', 'trench', 'deep sea', 'sub ']):
        white = np.random.randn(total_samples)
        # Deep underwater low-pass filter (sub-aquatic acoustic pressure)
        b_low, a_low = signal.butter(3, 0.022, btype='low')
        sub_bed = signal.lfilter(b_low, a_low, white) * 1.2
        
        # Submarine mechanical turbine / engine drone hum (58Hz + 116Hz + 174Hz)
        engine_hum = (
            0.5 * np.sin(2 * np.pi * 58.0 * t) +
            0.25 * np.sin(2 * np.pi * 116.0 * t) +
            0.12 * np.sin(2 * np.pi * 174.0 * t)
        ) * (0.85 + 0.15 * np.sin(2 * np.pi * 0.2 * t))
        
        # Hydrothermal vent bubbling / volcanic thermal rumble modulation
        vent_rumble = signal.lfilter(*signal.butter(2, [0.015, 0.06], btype='band'), np.random.randn(total_samples))
        vent_mod = (0.7 + 0.3 * np.sin(2 * np.pi * 0.4 * t)) * vent_rumble * 0.9

        # Sonar Ping Echoes (periodic chirps with long reverberant decay)
        sonar_layer = np.zeros(total_samples)
        ping_interval = 3.5
        for ping_sec in np.arange(0.3, duration, ping_interval):
            pidx = int(ping_sec * sr)
            if pidx < total_samples:
                plen = min(total_samples - pidx, int(2.2 * sr))
                pt = t[:plen]
                # Dual-tone sonar chirp (1020Hz & 1024Hz binaural beat with exponential decay)
                ping_tone = (
                    0.6 * np.sin(2 * np.pi * 1020.0 * pt) +
                    0.4 * np.sin(2 * np.pi * 1025.0 * pt)
                ) * np.exp(-2.2 * pt)
                sonar_layer[pidx:pidx + plen] += ping_tone * 0.75

        data = sub_bed * 0.55 + engine_hum * 0.35 + vent_mod * 0.4 + sonar_layer * 0.65

    # 8. Whoosh, Swoosh, Wind Transition
    elif any(k in prompt_lower for k in ['whoosh', 'swoosh', 'swipe', 'transition', 'flyby']):
        noise = np.random.randn(total_samples)
        center_t = duration * 0.45
        gauss_env = np.exp(-((t - center_t) ** 2) / (2 * (0.22 * duration) ** 2))
        b, a = signal.butter(2, [0.08, 0.35], btype='band')
        filtered = signal.lfilter(b, a, noise)
        data = filtered * gauss_env

    # 9. Rain, Ocean Surface, Stream, Water, Waves
    elif any(k in prompt_lower for k in ['rain', 'water', 'stream', 'ocean', 'sea', 'waves', 'river', 'waterfall']):
        white = np.random.randn(total_samples)
        b, a = signal.butter(3, 0.07, btype='low')
        water_bed = signal.lfilter(b, a, white)
        wave_mod = 0.5 + 0.5 * (np.sin(2 * np.pi * (1.0 / 4.0) * t) ** 2)
        b_hi, a_hi = signal.butter(2, [0.25, 0.65], btype='band')
        rain_sizzle = signal.lfilter(b_hi, a_hi, white) * 0.25
        data = (water_bed * wave_mod) + rain_sizzle

    # 10. Wind, Storm, Blizzard, Air, Atmosphere
    elif any(k in prompt_lower for k in ['wind', 'storm', 'blizzard', 'breeze', 'arctic', 'cold', 'ambient', 'atmosphere']):
        white = np.random.randn(total_samples)
        b, a = signal.butter(2, [0.02, 0.18], btype='band')
        wind_bed = signal.lfilter(b, a, white)
        gust = 0.6 + 0.4 * np.sin(2 * np.pi * 0.25 * t) * np.sin(2 * np.pi * 0.08 * t)
        data = wind_bed * gust

    # 11. Fire, Campfire, Crackle
    elif any(k in prompt_lower for k in ['fire', 'campfire', 'flame', 'burn', 'crackle']):
        white = np.random.randn(total_samples)
        b, a = signal.butter(2, 0.04, btype='low')
        rumble = signal.lfilter(b, a, white)
        pops = np.zeros(total_samples)
        num_pops = int(duration * 25)
        pop_indices = np.random.randint(0, total_samples, num_pops)
        for p_idx in pop_indices:
            plen = min(total_samples - p_idx, 120)
            pops[p_idx:p_idx + plen] += (np.random.rand(plen) * 2 - 1) * np.exp(-np.linspace(0, 5, plen)) * 0.8
        data = rumble * 0.6 + pops * 0.4

    # 12. General fallback for any custom sound description
    else:
        # Dynamic multi-harmonic acoustic transient
        noise = np.random.randn(total_samples)
        b, a = signal.butter(2, [0.04, 0.35], btype='band')
        filtered_noise = signal.lfilter(b, a, noise) * np.exp(-2.5 * t)
        sine_f0 = 220.0
        sine_harmonic = (
            0.5 * np.sin(2 * np.pi * sine_f0 * t) * np.exp(-3.0 * t) +
            0.3 * np.sin(2 * np.pi * (sine_f0 * 2) * t) * np.exp(-4.5 * t) +
            0.2 * np.sin(2 * np.pi * (sine_f0 * 3) * t) * np.exp(-6.0 * t)
        )
        data = filtered_noise * 0.6 + sine_harmonic * 0.5

    # Master envelope: Smooth fade-in (5ms) and fade-out (25ms) to prevent audio clicks
    fade_in_len = min(int(sr * 0.005), total_samples // 4)
    fade_out_len = min(int(sr * 0.025), total_samples // 4)
    if fade_in_len > 0:
        data[:fade_in_len] *= np.linspace(0.0, 1.0, fade_in_len)
    if fade_out_len > 0:
        data[-fade_out_len:] *= np.linspace(1.0, 0.0, fade_out_len)

    # Peak normalization to -0.5 dB
    max_amp = np.max(np.abs(data))
    if max_amp > 1e-6:
        data = (data / max_amp) * 0.94
    else:
        data = np.zeros_like(data)

    int_data = (data * 32767).astype(np.int16)
    wavfile.write(output_path, sr, int_data)
    return output_path

def run_sfx(prompt: str, hf_token: Optional[str] = None, duration: float = 5.0, guidance_scale: float = 3.5, output_path: Optional[str] = None) -> Tuple[str, dict]:
    """
    Short Foley/Action sound generation via haoheliu/audioldm2-text2audio-text2music
    when a Hugging Face token is supplied, otherwise (or on failure) procedural synthesis.

    Returns (output_path, info) where info["method"] says what actually produced the audio.
    """
    remote_error = None
    if not output_path:
        output_path = os.path.join(TEMP_DIR, f"sfx_{uuid.uuid4().hex}.wav")

    # If HF token is provided and Client is available, attempt remote Gradio space
    if hf_token and hf_token.strip() and Client is not None:
        try:
            with suppress_stdout_stderr():
                token = hf_token.strip()
                client = Client("haoheliu/audioldm2-text2audio-text2music", token=token)
                try:
                    res = client.predict(
                        text=prompt,
                        duration=duration,
                        guidance_scale=guidance_scale,
                        api_name="/text2audio"
                    )
                except Exception:
                    res = client.predict(
                        prompt,
                        "",
                        duration,
                        guidance_scale,
                        3,
                        42,
                        api_name="/text2audio"
                    )

                src = res[0] if isinstance(res, (list, tuple)) else res
                if isinstance(src, dict) and "name" in src:
                    src = src["name"]
                elif isinstance(src, dict) and "video" in src:
                    src = src["video"]

                shutil.copy(str(src), output_path)
                return output_path, {"method": "audioldm2"}
        except Exception as e_hf:
            remote_error = str(e_hf)[:300]
            print(f"[SFX Notice] Remote Gradio space: {e_hf}. Using procedural acoustic synthesis...", file=sys.stderr)

    # Keyword-driven procedural synthesis (offline fallback)
    generate_procedural_foley_fallback(prompt, duration=duration, output_path=output_path)
    info = {"method": "procedural"}
    if remote_error:
        info["remote_error"] = remote_error
    return output_path, info

def run_ambient(prompt: str, hf_token: Optional[str] = None, seconds_total: float = 10.0, steps: int = 100, output_path: Optional[str] = None) -> Tuple[str, dict]:
    """
    Continuous environmental sounds via stabilityai/stable-audio-open-1.0 when a Hugging
    Face token is supplied, otherwise (or on failure) procedural synthesis.

    Returns (output_path, info) where info["method"] says what actually produced the audio.
    """
    remote_error = None
    if not output_path:
        output_path = os.path.join(TEMP_DIR, f"ambient_{uuid.uuid4().hex}.wav")

    if hf_token and hf_token.strip() and Client is not None:
        try:
            with suppress_stdout_stderr():
                token = hf_token.strip()
                client = Client("stabilityai/stable-audio-open-1.0", token=token)
                try:
                    res = client.predict(
                        prompt=prompt,
                        seconds_total=seconds_total,
                        steps=steps,
                        api_name="/predict"
                    )
                except Exception:
                    res = client.predict(
                        prompt,
                        seconds_total,
                        steps,
                        api_name="/predict"
                    )

                src = res[0] if isinstance(res, (list, tuple)) else res
                if isinstance(src, dict) and "name" in src:
                    src = src["name"]
                elif isinstance(src, dict) and "value" in src:
                    src = src["value"]

                shutil.copy(str(src), output_path)
                return output_path, {"method": "stable-audio-open"}
        except Exception as e_hf:
            remote_error = str(e_hf)[:300]
            print(f"[Ambient Notice] Remote Gradio space: {e_hf}. Using procedural ambient synthesis...", file=sys.stderr)

    # Ambient procedural sound generator (offline fallback)
    generate_procedural_foley_fallback(prompt, duration=seconds_total, output_path=output_path)
    info = {"method": "procedural"}
    if remote_error:
        info["remote_error"] = remote_error
    return output_path, info

def list_voices():
    """Return Edge TTS voices as [{id, name, gender, locale, friendlyName}]."""
    try:
        import edge_tts
        raw = asyncio.run(edge_tts.list_voices())
        voices = []
        for v in raw:
            voice_name = v.get("ShortName") or v.get("Name") or ""
            if not voice_name:
                continue
            locale = v.get("Locale") or "en-US"
            short = voice_name.split("-")[-1].replace("Neural", "")
            gender = v.get("Gender") if v.get("Gender") in ("Female", "Male") else "Unknown"
            voices.append({
                "id": voice_name,
                "name": short,
                "gender": gender,
                "locale": locale,
                "friendlyName": f"{short} ({locale})"
            })
        return voices
    except Exception as e:
        print(f"[Warning] Failed to list voices: {e}", file=sys.stderr)
        return []

# ----------------- FastAPI App Layer -----------------

class SfxRequest(BaseModel):
    prompt: str
    hf_token: Optional[str] = None
    duration: Optional[float] = 5.0
    guidance_scale: Optional[float] = 3.5

class AmbientRequest(BaseModel):
    prompt: str
    hf_token: Optional[str] = None
    seconds_total: Optional[float] = 10.0
    steps: Optional[int] = 100

class ImageRequest(BaseModel):
    prompt: str
    width: Optional[int] = 1080
    height: Optional[int] = 1920

class VideoRequest(BaseModel):
    prompt: str
    hf_token: Optional[str] = None
    negative_prompt: Optional[str] = "low quality, blurry, distorted, jitter, artifact"
    seconds: Optional[float] = 4.0
    motion_style: Optional[str] = "glide"  # "glide", "zoom", "pan", "orbit"

def ensure_web_compatible_mp4(raw_input: str, output_path: str) -> str:
    """
    Force web-compatible encoding by applying:
    ffmpeg -y -v error -i [RAW_INPUT] -pix_fmt yuv420p -c:v libx264 -movflags +faststart [OUTPUT_MP4]
    Ensures HTML5 video elements can stream and render frames smoothly without freezing on the first frame.
    """
    temp_target = output_path
    same_file = os.path.abspath(raw_input) == os.path.abspath(output_path)
    if same_file:
        temp_target = os.path.join(TEMP_DIR, f"webconv_{uuid.uuid4().hex}.mp4")

    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-i", raw_input,
        "-pix_fmt", "yuv420p",
        "-c:v", "libx264",
        "-movflags", "+faststart",
        temp_target
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT)
        if proc.returncode == 0 and os.path.exists(temp_target) and os.path.getsize(temp_target) > 0:
            if same_file:
                shutil.move(temp_target, output_path)
            return output_path
        else:
            print(f"[FFmpeg Transcode Error] {proc.stderr}", file=sys.stderr)
            if not same_file and os.path.exists(raw_input):
                shutil.copy(raw_input, output_path)
            return output_path
    except Exception as e:
        print(f"[FFmpeg Transcode Exception] {e}", file=sys.stderr)
        if not same_file and os.path.exists(raw_input):
            shutil.copy(raw_input, output_path)
        return output_path
    finally:
        if same_file and os.path.exists(temp_target) and temp_target != output_path:
            cleanup_file(temp_target)

def generate_video_open(
    prompt: str,
    hf_token: Optional[str] = None,
    negative_prompt: Optional[str] = "low quality, blurry, distorted, jitter, artifact",
    output_path: Optional[str] = None,
    seconds: float = 4.0,
    motion_style: str = "zoom",
    base_model: str = "epiCRealism",
    steps: int = 4,
    resolution: str = "720p"
) -> Tuple[str, dict]:
    """
    Text-to-video using free public Hugging Face Spaces, with an offline fallback.

    Order of attempts:
      1. ByteDance/AnimateDiff-Lightning: a short (~1.6s) neural clip that is looped,
         upscaled and frame-interpolated with FFmpeg to the requested duration.
      2. Other Spaces (CogVideoX, LTX-Video, ...) when a token is supplied.
      3. Fallback: two Pollinations stills cross-dissolved with FFmpeg (NOT neural video).

    A faint low-frequency hum is mixed in as an audio bed so the file has a track.

    Returns (output_path, info). info["method"] is one of "animatediff-lightning",
    "space:<name>" or "keyframe-morph"; info["remote_error"] explains why neural
    generation was skipped when the fallback was used.
    """
    remote_errors = []
    if not output_path:
        output_path = os.path.join(TEMP_DIR, f"temp_vid_{uuid.uuid4().hex}.mp4")

    token = hf_token or os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
    duration_sec = max(2.0, min(10.0, float(seconds)))
    
    # 1. Map motion style to AnimateDiff Motion LoRA
    motion_lora_map = {
        "zoom": "guoyww/animatediff-motion-lora-zoom-in",
        "zoom-in": "guoyww/animatediff-motion-lora-zoom-in",
        "zoom-out": "guoyww/animatediff-motion-lora-zoom-out",
        "pan": "guoyww/animatediff-motion-lora-pan-left",
        "pan-left": "guoyww/animatediff-motion-lora-pan-left",
        "pan-right": "guoyww/animatediff-motion-lora-pan-right",
        "tilt-up": "guoyww/animatediff-motion-lora-tilt-up",
        "tilt-down": "guoyww/animatediff-motion-lora-tilt-down",
        "orbit": "guoyww/animatediff-motion-lora-rolling-clockwise",
        "rolling-clockwise": "guoyww/animatediff-motion-lora-rolling-clockwise",
        "rolling-anticlockwise": "guoyww/animatediff-motion-lora-rolling-anticlockwise",
        "natural": "",
        "glide": "guoyww/animatediff-motion-lora-zoom-in",
    }
    selected_motion = motion_lora_map.get(motion_style.lower(), "guoyww/animatediff-motion-lora-zoom-in")
    selected_base = "ToonYou" if (base_model and "toon" in base_model.lower()) else "epiCRealism"
    selected_steps = 8 if (steps and int(steps) == 8) else 4

    # 2. Priority: Real Multi-Frame Neural Diffusion via ByteDance/AnimateDiff-Lightning
    raw_gradio_video = None
    try:
        print(f"[Video Gen] Launching AnimateDiff-Lightning Neural Diffusion (Base: {selected_base}, Motion: {selected_motion or 'Natural'}, Steps: {selected_steps})...", file=sys.stderr)
        if Client is None:
            raise RuntimeError("gradio_client is not installed (pip install gradio_client)")
        client_kwargs = {}
        if token:
            client_kwargs["token"] = token.strip()
        client = Client("ByteDance/AnimateDiff-Lightning", **client_kwargs)
        
        # predict(prompt, base, motion, step, api_name="/generate_image")
        result = client.predict(
            prompt=prompt.strip(),
            base=selected_base,
            motion=selected_motion,
            step=selected_steps,
            api_name="/generate_image"
        )
        
        video_file = None
        if isinstance(result, dict) and "video" in result:
            video_file = result["video"]
        elif isinstance(result, (list, tuple)) and len(result) > 0:
            video_file = result[0]
        elif isinstance(result, str):
            video_file = result

        if video_file and os.path.exists(str(video_file)) and os.path.getsize(str(video_file)) > 1000:
            raw_gradio_video = str(video_file)
            print(f"[Video Gen] AnimateDiff-Lightning generated neural frames ({os.path.getsize(raw_gradio_video)} bytes)", file=sys.stderr)
            
            # Post-process with FFmpeg: upscale to HD (720x720 or 720x1280), interpolate framerate to 24fps,
            # loop to duration, and inject matching procedural ambient audio
            processed_tmp = os.path.join(TEMP_DIR, f"proc_diff_{uuid.uuid4().hex}.mp4")
            
            # Determine loop repetitions (raw AnimateDiff is ~1.6s)
            stream_loops = max(1, int(np.ceil(duration_sec / 1.6)))
            
            # Atmospheric ambient sound generation filter
            audio_filter = (
                f"sine=frequency=115:duration={duration_sec},volume=0.035,"
                f"afade=t=in:ss=0:d=0.5,afade=t=out:st={duration_sec-0.5}:d=0.5"
            )
            
            scale_w, scale_h = (1080, 1080) if resolution == "1080p" else (720, 720)
            vf_enhance = (
                f"scale={scale_w}:{scale_h}:flags=lanczos,"
                f"unsharp=5:5:0.7:5:5:0.0,"
                f"framerate=fps=24:interp_start=0:interp_end=255:scene=100"
            )
            
            cmd = [
                "ffmpeg", "-y", "-v", "error",
                "-stream_loop", str(stream_loops),
                "-i", raw_gradio_video,
                "-f", "lavfi", "-i", audio_filter,
                "-filter_complex", f"[0:v]{vf_enhance}[v]",
                "-map", "[v]",
                "-map", "1:a",
                "-c:v", "libx264", "-preset", "faster", "-crf", "18",
                "-t", str(duration_sec),
                "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "128k",
                "-shortest",
                "-movflags", "+faststart",
                processed_tmp
            ]
            subprocess.run(cmd, check=True, timeout=FFMPEG_TIMEOUT)
            ensure_web_compatible_mp4(processed_tmp, output_path)
            cleanup_file(processed_tmp)
            print(f"[Video Gen] Successfully outputted enhanced neural diffusion video to {output_path}", file=sys.stderr)
            return output_path, {"method": "animatediff-lightning", "model": f"AnimateDiff-Lightning ({selected_base})"}

    except Exception as e_diff:
        remote_errors.append(f"AnimateDiff-Lightning: {str(e_diff)[:200]}")
        print(f"[Video Gen Notice] AnimateDiff-Lightning pass exception: {e_diff}", file=sys.stderr)

    # 3. Fallback: Secondary ZeroGPU Spaces (if token supplied or AnimateDiff queue busy)
    if token and Client is not None:
        spaces_to_try = [
            ("prithivMLmods/NAVA-Text-to-Video", "/predict"),
            ("THUDM/CogVideoX-5B", "/generate"),
            ("Wan-AI/Wan2.1", "/predict"),
            ("Lightricks/LTX-Video", "/generate_video"),
            ("multimodalart/ltx-video", "/generate_video"),
        ]
        for space_name, api_endpoint in spaces_to_try:
            raw_space_tmp = None
            try:
                print(f"[Video Gen] Attempting Secondary Space '{space_name}'...", file=sys.stderr)
                client = Client(space_name, token=token.strip())
                try:
                    result = client.predict(
                        prompt=prompt,
                        negative_prompt=negative_prompt or "low quality, blurry",
                        api_name=api_endpoint
                    )
                except Exception:
                    result = client.predict(prompt, api_name=api_endpoint)

                video_file = None
                if isinstance(result, (list, tuple)) and len(result) > 0:
                    video_file = result[0]
                elif isinstance(result, str):
                    video_file = result
                elif isinstance(result, dict) and "video" in result:
                    video_file = result["video"]

                if video_file and os.path.exists(str(video_file)):
                    raw_space_tmp = os.path.join(TEMP_DIR, f"raw_gradio_{uuid.uuid4().hex}.mp4")
                    shutil.copy(str(video_file), raw_space_tmp)
                    ensure_web_compatible_mp4(raw_space_tmp, output_path)
                    cleanup_file(raw_space_tmp)
                    print(f"[Video Gen] Successfully retrieved video from {space_name}: {output_path}", file=sys.stderr)
                    return output_path, {"method": f"space:{space_name}", "model": space_name}
            except Exception as e_sp:
                if raw_space_tmp:
                    cleanup_file(raw_space_tmp)
                remote_errors.append(f"{space_name}: {str(e_sp)[:120]}")
                print(f"[Video Gen] Space {space_name} request note: {e_sp}", file=sys.stderr)

    # 4. Offline fallback: cross-dissolve between two stills (if every neural queue is unavailable)
    raw_synth_path = os.path.join(TEMP_DIR, f"raw_synth_{uuid.uuid4().hex}.mp4")
    frame1_path = os.path.join(TEMP_DIR, f"vidframe1_{uuid.uuid4().hex}.jpg")
    frame2_path = os.path.join(TEMP_DIR, f"vidframe2_{uuid.uuid4().hex}.jpg")
    try:
        print(f"[Video Gen] Synthesizing Multi-Frame Dynamic Generative Sequence with Motion Morphing...", file=sys.stderr)
        
        # Generate 2 progressive temporal state keyframes with altered optical momentum
        p1 = f"{prompt}, cinematic master keyframe angle, high dynamic motion"
        p2 = f"{prompt}, dynamic shifting perspective, fluid momentum, atmospheric motion particles"
        
        try:
            generate_image_pollinations(p1, output_path=frame1_path, width=720, height=720)
            generate_image_pollinations(p2, output_path=frame2_path, width=720, height=720)
        except Exception:
            generate_image_pollinations(prompt, output_path=frame1_path, width=720, height=720)
            shutil.copy(frame1_path, frame2_path)
            
        fps = 24
        half_dur = duration_sec / 2.0
        
        # Multi-frame cross-dissolve & optical flow morphing + dynamic shimmer
        vf_morph = (
            f"[0:v]scale=720:720:flags=lanczos,setsar=1,fps={fps}[v0];"
            f"[1:v]scale=720:720:flags=lanczos,setsar=1,fps={fps}[v1];"
            f"[v0][v1]xfade=transition=smoothleft:duration=1.2:offset={max(0.5, half_dur - 0.6)},"
            f"eq=contrast='1.0+0.04*sin(2*PI*t/1.8)':brightness='0.02*sin(2*PI*t/1.2)',"
            f"format=yuv420p[outv]"
        )

        audio_src = (
            f"sine=frequency=112:duration={duration_sec},volume=0.035,"
            f"afade=t=in:ss=0:d=0.5,afade=t=out:st={duration_sec-0.5}:d=0.5"
        )

        cmd = [
            "ffmpeg", "-y", "-v", "error",
            "-loop", "1", "-t", str(half_dur + 1.2), "-i", frame1_path,
            "-loop", "1", "-t", str(half_dur + 1.2), "-i", frame2_path,
            "-f", "lavfi", "-i", audio_src,
            "-filter_complex", vf_morph,
            "-map", "[outv]",
            "-map", "2:a",
            "-c:v", "libx264", "-preset", "faster", "-crf", "18",
            "-t", str(duration_sec),
            "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "128k", "-shortest",
            "-movflags", "+faststart",
            raw_synth_path
        ]
        
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT)
        if proc.returncode != 0 or not os.path.exists(raw_synth_path):
            print(f"[FFmpeg Morph Notice] {proc.stderr}, using single frame scale...", file=sys.stderr)
            cmd_fallback = [
                "ffmpeg", "-y", "-v", "error",
                "-loop", "1", "-i", frame1_path,
                "-vf", "scale=720:720,format=yuv420p",
                "-c:v", "libx264", "-t", str(duration_sec), "-r", "24",
                "-movflags", "+faststart",
                raw_synth_path
            ]
            subprocess.run(cmd_fallback, check=True, timeout=FFMPEG_TIMEOUT)

        ensure_web_compatible_mp4(raw_synth_path, output_path)
        info = {"method": "keyframe-morph", "model": "Keyframe cross-dissolve (fallback)"}
        if remote_errors:
            info["remote_error"] = " | ".join(remote_errors)[:500]
        return output_path, info
    finally:
        cleanup_file(frame1_path)
        cleanup_file(frame2_path)
        cleanup_file(raw_synth_path)

MAX_IMAGE_DIM = 2048


def generate_image_pollinations(prompt: str, output_path: Optional[str] = None, width: int = 1080, height: int = 1920) -> str:
    """
    Fetches an image from the open-access Pollinations endpoint (no API key needed).
    Dimensions are clamped to a sane range and the response must actually be an image.
    """
    if not output_path:
        output_path = os.path.join(TEMP_DIR, f"temp_img_{uuid.uuid4().hex}.jpg")

    width = max(64, min(MAX_IMAGE_DIM, int(width)))
    height = max(64, min(MAX_IMAGE_DIM, int(height)))
    safe_prompt = urllib.parse.quote(prompt.strip(), safe="")
    url = f"https://image.pollinations.ai/prompt/{safe_prompt}?width={width}&height={height}&nologo=true"

    response = requests.get(url, timeout=45)
    response.raise_for_status()
    content_type = response.headers.get("Content-Type", "")
    if not content_type.startswith("image/") or not response.content:
        raise RuntimeError(f"Image service returned an unexpected response ({content_type or 'no content type'}).")

    with open(output_path, "wb") as f:
        f.write(response.content)

    return output_path

# ----------------- Optional FastAPI App Layer (uvicorn audio_engine:app) -----------------

class SfxRequest(BaseModel):
    prompt: str
    hf_token: Optional[str] = None
    duration: Optional[float] = 5.0
    guidance_scale: Optional[float] = 3.5

class AmbientRequest(BaseModel):
    prompt: str
    hf_token: Optional[str] = None
    seconds_total: Optional[float] = 10.0
    steps: Optional[int] = 100

class ImageRequest(BaseModel):
    prompt: str
    width: Optional[int] = 1080
    height: Optional[int] = 1920

class VideoRequest(BaseModel):
    prompt: str
    hf_token: Optional[str] = None
    negative_prompt: Optional[str] = "low quality, blurry, distorted, jitter, artifact"
    seconds: Optional[float] = 4.0
    motion_style: Optional[str] = "zoom"  # zoom, pan, orbit, tilt-up, ...

if FastAPI is not None:
    app = FastAPI(title="Open-Access Audio & Sound Effects Engine")

    def _file_response(path: str, media_type: str, background_tasks, filename: Optional[str] = None):
        if not os.path.exists(path) or os.path.getsize(path) == 0:
            cleanup_file(path)
            raise HTTPException(status_code=500, detail="Generation produced no output.")
        background_tasks.add_task(cleanup_file, path)
        return FileResponse(path, media_type=media_type, filename=filename)

    # These are plain `def` handlers on purpose: they block on ffmpeg / network, and
    # FastAPI runs sync handlers in a worker thread instead of stalling the event loop.
    @app.post("/api/image")
    def generate_image(request: ImageRequest, background_tasks: BackgroundTasks):
        out = os.path.join(TEMP_DIR, f"temp_img_{uuid.uuid4().hex}.jpg")
        try:
            generate_image_pollinations(request.prompt, out, request.width or 1080, request.height or 1920)
            return _file_response(out, "image/jpeg", background_tasks)
        except HTTPException:
            raise
        except Exception as e:
            cleanup_file(out)
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/video")
    def generate_video_endpoint(request: VideoRequest, background_tasks: BackgroundTasks):
        out = os.path.join(TEMP_DIR, f"temp_vid_{uuid.uuid4().hex}.mp4")
        try:
            generate_video_open(
                prompt=request.prompt,
                hf_token=request.hf_token,
                negative_prompt=request.negative_prompt,
                output_path=out,
                seconds=request.seconds or 4.0,
                motion_style=request.motion_style or "zoom",
            )
            return _file_response(out, "video/mp4", background_tasks)
        except HTTPException:
            raise
        except Exception as e:
            cleanup_file(out)
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/sfx")
    def api_sfx_endpoint(payload: SfxRequest, background_tasks: BackgroundTasks):
        if not payload.prompt or not payload.prompt.strip():
            raise HTTPException(status_code=400, detail="Prompt is required for sound effect generation.")
        out = os.path.join(TEMP_DIR, f"sfx_{uuid.uuid4().hex}.wav")
        try:
            run_sfx(
                prompt=payload.prompt.strip(),
                hf_token=payload.hf_token,
                duration=payload.duration or 5.0,
                guidance_scale=payload.guidance_scale or 3.5,
                output_path=out,
            )
            return _file_response(out, "audio/wav", background_tasks, f"sfx_{uuid.uuid4().hex[:6]}.wav")
        except HTTPException:
            raise
        except Exception as e:
            cleanup_file(out)
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/api/ambient")
    def api_ambient_endpoint(payload: AmbientRequest, background_tasks: BackgroundTasks):
        if not payload.prompt or not payload.prompt.strip():
            raise HTTPException(status_code=400, detail="Prompt is required for ambient soundscape generation.")
        out = os.path.join(TEMP_DIR, f"ambient_{uuid.uuid4().hex}.wav")
        try:
            run_ambient(
                prompt=payload.prompt.strip(),
                hf_token=payload.hf_token,
                seconds_total=payload.seconds_total or 10.0,
                steps=payload.steps or 100,
                output_path=out,
            )
            return _file_response(out, "audio/wav", background_tasks, f"ambient_{uuid.uuid4().hex[:6]}.wav")
        except HTTPException:
            raise
        except Exception as e:
            cleanup_file(out)
            raise HTTPException(status_code=500, detail=str(e))
else:
    app = None

# ----------------- CLI Dispatcher -----------------
#
# Every action reads an optional JSON payload file (argv[2]) and prints exactly one JSON
# object on stdout: {"success": true, ...} or {"success": false, "error": "..."}.
# The Node server relies on that contract.

def _load_payload(path: str) -> dict:
    with open(path, "r") as f:
        return json.load(f)


def _action_tts(args):
    data = _load_payload(args[0])
    out = asyncio.run(run_tts_async(
        text=data.get("text", ""),
        voice=data.get("voice", "en-US-AndrewMultilingualNeural"),
        rate=data.get("rate", "+0%"),
        pitch=data.get("pitch", "+0Hz"),
        volume=data.get("volume", "+0%"),
        output_path=data.get("output_path"),
    ))
    return {"output_path": out}


def _action_stt(args):
    return {"text": run_stt(args[0], language=args[1] if len(args) > 1 else "en-US")}


def _action_analyze(args):
    norm_file = None
    try:
        norm_file = normalize_to_pcm_wav(args[0], sample_rate=24000)
        profile = extract_acoustic_profile(norm_file)
        # Transcription needs the network; the acoustic profile is still useful without it.
        try:
            profile['detected_text'] = run_stt(norm_file)
        except Exception as e:
            profile['detected_text'] = ""
            profile['stt_error'] = str(e)[:300]
        return {"profile": profile}
    finally:
        cleanup_file(norm_file)


def _action_clone(args):
    data = _load_payload(args[0])
    out, used_ref_text, profile = run_clone(
        reference_audio_path=data.get("ref_audio_path"),
        text_to_speak=data.get("text", ""),
        ref_text=data.get("ref_text", ""),
        hf_token=data.get("hf_token"),
        pitch_adj=int(data.get("pitch_adj", 0)),
        timbre_adj=float(data.get("timbre_adj", 0.0)),
        output_path=data.get("output_path"),
    )
    return {"output_path": out, "ref_text": used_ref_text, "profile": profile}


def _action_sfx(args):
    data = _load_payload(args[0])
    out, info = run_sfx(
        prompt=data.get("prompt", ""),
        hf_token=data.get("hf_token"),
        duration=float(data.get("duration", 5.0)),
        guidance_scale=float(data.get("guidance_scale", 3.5)),
        output_path=data.get("output_path"),
    )
    return {"output_path": out, **info}


def _action_ambient(args):
    data = _load_payload(args[0])
    out, info = run_ambient(
        prompt=data.get("prompt", ""),
        hf_token=data.get("hf_token"),
        seconds_total=float(data.get("seconds_total", 10.0)),
        steps=int(data.get("steps", 100)),
        output_path=data.get("output_path"),
    )
    return {"output_path": out, **info}


def _action_image(args):
    data = _load_payload(args[0])
    out = generate_image_pollinations(
        prompt=data.get("prompt", ""),
        output_path=data.get("output_path"),
        width=int(data.get("width", 1080)),
        height=int(data.get("height", 1920)),
    )
    return {"output_path": out}


def _action_video(args):
    data = _load_payload(args[0])
    out, info = generate_video_open(
        prompt=data.get("prompt", ""),
        hf_token=data.get("hf_token"),
        negative_prompt=data.get("negative_prompt"),
        output_path=data.get("output_path"),
        seconds=float(data.get("seconds", 4.0)),
        motion_style=data.get("motion_style", "zoom"),
        base_model=data.get("base_model", "epiCRealism"),
        steps=int(data.get("steps", 4)),
        resolution=data.get("resolution", "720p"),
    )
    return {"output_path": out, **info}


def _action_voices(_args):
    return {"voices": list_voices()}


def _action_check(_args):
    """Report which optional runtime dependencies are available (used by /api/health)."""
    import importlib.util

    modules = ["numpy", "scipy", "requests", "edge_tts", "speech_recognition", "gradio_client"]
    return {
        "python": sys.version.split()[0],
        "ffmpeg": shutil.which("ffmpeg") is not None,
        "modules": {m: importlib.util.find_spec(m) is not None for m in modules},
    }


ACTIONS = {
    "tts": (_action_tts, 1),
    "stt": (_action_stt, 1),
    "analyze": (_action_analyze, 1),
    "clone": (_action_clone, 1),
    "sfx": (_action_sfx, 1),
    "ambient": (_action_ambient, 1),
    "image": (_action_image, 1),
    "video": (_action_video, 1),
    "voices": (_action_voices, 0),
    "check": (_action_check, 0),
}


def main(argv):
    usage = f"Usage: audio_engine.py [{'|'.join(ACTIONS)}] [payload.json | input_file]"
    if len(argv) < 2:
        print(json.dumps({"success": False, "error": f"No action specified. {usage}"}))
        return 1

    action = argv[1]
    entry = ACTIONS.get(action)
    if entry is None:
        print(json.dumps({"success": False, "error": f"Unknown action '{action}'. {usage}"}))
        return 1

    handler, required_args = entry
    args = argv[2:]
    if len(args) < required_args:
        print(json.dumps({"success": False, "error": f"Action '{action}' requires an argument. {usage}"}))
        return 1

    try:
        result = handler(args)
        print(json.dumps({"success": True, **result}))
        return 0
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
