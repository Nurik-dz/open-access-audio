"""Offline tests for audio_engine.py. Network and remote models are always faked."""
import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
import wave

import numpy as np
import pytest
import scipy.io.wavfile as wavfile

import audio_engine as engine

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE_PY = os.path.join(ROOT, "audio_engine.py")
needs_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg not installed")


def write_voice(path, f0, seconds=3.0, sr=24000):
    """A harmonic-rich tone that autocorrelation pitch tracking treats like a voice."""
    t = np.arange(int(sr * seconds)) / sr
    sig = sum(np.sin(2 * np.pi * k * f0 * t) / k for k in range(1, 9))
    sig = sig / np.max(np.abs(sig)) * 0.6
    wavfile.write(path, sr, (sig * 32767).astype(np.int16))
    return str(path)


def wav_info(path):
    with wave.open(str(path)) as w:
        return w.getframerate(), w.getnchannels(), w.getnframes() / w.getframerate()


# --------------------------------------------------------------- acoustic profile


@pytest.mark.parametrize(
    "f0, gender",
    [(105, "male"), (160, "neutral"), (230, "female")],
)
def test_pitch_and_gender_are_measured(tmp_path, f0, gender):
    profile = engine.extract_acoustic_profile(write_voice(tmp_path / "v.wav", f0))
    assert profile["measured"] is True
    assert profile["pitch_hz"] == pytest.approx(f0, rel=0.1)
    assert profile["gender"] == gender


def test_profile_has_no_fabricated_similarity_score(tmp_path):
    profile = engine.extract_acoustic_profile(write_voice(tmp_path / "v.wav", 120))
    assert "similarity_score" not in profile


def test_too_short_audio_is_flagged_as_unmeasured(tmp_path):
    path = tmp_path / "short.wav"
    wavfile.write(path, 24000, np.zeros(1000, dtype=np.int16))
    profile = engine.extract_acoustic_profile(str(path))
    assert profile["measured"] is False
    assert "too short" in profile["pitch_label"]


def test_silence_does_not_crash(tmp_path):
    path = tmp_path / "silence.wav"
    wavfile.write(path, 24000, np.zeros(24000 * 2, dtype=np.int16))
    profile = engine.extract_acoustic_profile(str(path))
    assert profile["pitch_hz"] == 150.0


def test_long_audio_is_capped_so_analysis_stays_fast(tmp_path):
    path = write_voice(tmp_path / "long.wav", 120, seconds=engine.MAX_ANALYSIS_SECONDS * 3)
    started = time.time()
    profile = engine.extract_acoustic_profile(path)
    assert time.time() - started < 30
    assert profile["pitch_hz"] == pytest.approx(120, rel=0.1)


# ------------------------------------------------------------- procedural audio


@pytest.mark.parametrize(
    "prompt",
    ["double knock on wooden door", "heavy punch impact", "footsteps walking", "laser blaster", "heavy rain in forest", "something unrecognisable"],
)
def test_procedural_audio_is_valid_and_audible(tmp_path, prompt):
    out = str(tmp_path / "out.wav")
    engine.generate_procedural_foley_fallback(prompt, duration=2.0, output_path=out)
    sr, channels, seconds = wav_info(out)
    assert (sr, channels) == (24000, 1)
    assert seconds == pytest.approx(2.0, abs=0.05)
    _, data = wavfile.read(out)
    assert np.max(np.abs(data)) > 500, "output should not be silent"


def test_procedural_duration_is_clamped(tmp_path):
    out = str(tmp_path / "out.wav")
    engine.generate_procedural_foley_fallback("rain", duration=9999, output_path=out)
    assert wav_info(out)[2] == pytest.approx(30.0, abs=0.1)


# --------------------------------------------------------- remote → local fallback


def test_sfx_without_token_is_procedural(tmp_path):
    out, info = engine.run_sfx("door knock", None, 1.0, 3.5, str(tmp_path / "o.wav"))
    assert info == {"method": "procedural"}
    assert os.path.getsize(out) > 0


def test_sfx_reports_remote_failure_but_still_delivers(tmp_path, monkeypatch):
    class Boom:
        def __init__(self, *a, **k):
            raise RuntimeError("space is sleeping")

    monkeypatch.setattr(engine, "Client", Boom)
    out, info = engine.run_sfx("laser", "hf_token", 1.0, 3.5, str(tmp_path / "o.wav"))
    assert info["method"] == "procedural"
    assert "space is sleeping" in info["remote_error"]
    assert os.path.getsize(out) > 0


def test_sfx_uses_remote_model_when_it_works(tmp_path, monkeypatch):
    produced = write_voice(tmp_path / "remote.wav", 200, seconds=1)

    class Ok:
        def __init__(self, *a, **k):
            pass

        def predict(self, *a, **k):
            return [produced]

    monkeypatch.setattr(engine, "Client", Ok)
    _, info = engine.run_sfx("laser", "hf_token", 1.0, 3.5, str(tmp_path / "o.wav"))
    assert info == {"method": "audioldm2"}


def test_ambient_reports_method(tmp_path):
    _, info = engine.run_ambient("rain", None, 2.0, 50, str(tmp_path / "o.wav"))
    assert info["method"] == "procedural"


# ----------------------------------------------------------------- tts / voices


class FakeCommunicate:
    last = None

    def __init__(self, text, voice, rate, pitch, volume):
        FakeCommunicate.last = dict(text=text, voice=voice, rate=rate, pitch=pitch, volume=volume)

    async def save(self, path):
        with open(path, "wb") as f:
            f.write(b"ID3fake")


def test_tts_accepts_text_starting_with_a_dash(tmp_path, monkeypatch):
    # The old CLI-based implementation passed this to argparse as an option and failed.
    import edge_tts

    monkeypatch.setattr(edge_tts, "Communicate", FakeCommunicate)
    out = asyncio.run(engine.run_tts_async("-5 degrees tonight", output_path=str(tmp_path / "o.mp3")))
    assert FakeCommunicate.last["text"] == "-5 degrees tonight"
    assert os.path.getsize(out) > 0


def test_tts_fails_loudly_on_empty_output(tmp_path, monkeypatch):
    import edge_tts

    class Empty(FakeCommunicate):
        async def save(self, path):
            open(path, "wb").close()

    monkeypatch.setattr(edge_tts, "Communicate", Empty)
    with pytest.raises(RuntimeError, match="empty output"):
        asyncio.run(engine.run_tts_async("hi", output_path=str(tmp_path / "o.mp3")))


def test_list_voices_maps_edge_tts_catalogue(monkeypatch):
    import edge_tts

    async def fake_list():
        return [
            {"ShortName": "en-US-AndrewMultilingualNeural", "Locale": "en-US", "Gender": "Male"},
            {"ShortName": "zh-CN-liaoning-XiaobeiNeural", "Locale": "zh-CN-liaoning", "Gender": "Female"},
            {"ShortName": "", "Locale": "xx", "Gender": "Male"},
        ]

    monkeypatch.setattr(edge_tts, "list_voices", fake_list)
    voices = engine.list_voices()
    assert [v["id"] for v in voices] == ["en-US-AndrewMultilingualNeural", "zh-CN-liaoning-XiaobeiNeural"]
    assert voices[0]["name"] == "AndrewMultilingual" and voices[0]["gender"] == "Male"
    assert voices[1]["friendlyName"] == "Xiaobei (zh-CN-liaoning)"


def test_list_voices_returns_empty_when_offline(monkeypatch):
    import edge_tts

    async def offline():
        raise OSError("no network")

    monkeypatch.setattr(edge_tts, "list_voices", offline)
    assert engine.list_voices() == []


# ------------------------------------------------------------------ clone / analyze


def test_analyze_survives_transcription_failure(tmp_path, monkeypatch):
    ref = write_voice(tmp_path / "ref.wav", 120)

    def offline(_path, language="en-US"):
        raise RuntimeError("Google Web Speech API error")

    monkeypatch.setattr(engine, "run_stt", offline)
    profile = engine._action_analyze([ref])["profile"]
    assert profile["pitch_hz"] == pytest.approx(120, rel=0.1)
    assert profile["detected_text"] == ""
    assert "Google Web Speech" in profile["stt_error"]


@needs_ffmpeg
def test_local_clone_is_labelled_honestly(tmp_path, monkeypatch):
    ref = write_voice(tmp_path / "ref.wav", 120)

    async def fake_tts(text, voice, rate, pitch, volume="+0%", output_path=None):
        write_voice(output_path, 130, seconds=1)  # WAV bytes; ffmpeg probes content, not the name
        return output_path

    monkeypatch.setattr(engine, "run_tts_async", fake_tts)
    monkeypatch.setattr(engine, "run_stt", lambda *_a, **_k: "")

    out, ref_text, profile = engine.run_clone(ref, "hello there", pitch_adj=500, timbre_adj=-500, output_path=str(tmp_path / "o.wav"))
    assert os.path.getsize(out) > 0
    assert profile["method"].startswith("Acoustic Voice Match")
    assert "remote_error" not in profile
    assert "similarity_score" not in profile


@needs_ffmpeg
def test_clone_records_why_the_remote_model_was_skipped(tmp_path, monkeypatch):
    ref = write_voice(tmp_path / "ref.wav", 120)

    class Boom:
        def __init__(self, *a, **k):
            raise RuntimeError("quota exceeded")

    async def fake_tts(text, voice, rate, pitch, volume="+0%", output_path=None):
        write_voice(output_path, 130, seconds=1)
        return output_path

    monkeypatch.setattr(engine, "Client", Boom)
    monkeypatch.setattr(engine, "run_tts_async", fake_tts)
    monkeypatch.setattr(engine, "run_stt", lambda *_a, **_k: "")
    _, _, profile = engine.run_clone(ref, "hi", hf_token="hf_x", output_path=str(tmp_path / "o.wav"))
    assert "quota exceeded" in profile["remote_error"]


# ------------------------------------------------------------------------ ffmpeg


@needs_ffmpeg
def test_normalize_converts_to_mono_pcm_at_requested_rate(tmp_path):
    src = write_voice(tmp_path / "src.wav", 150, sr=44100)
    out = engine.normalize_to_pcm_wav(src, sample_rate=16000)
    assert wav_info(out)[:2] == (16000, 1)


def test_normalize_rejects_garbage_with_a_clear_error(tmp_path):
    bad = tmp_path / "bad.wav"
    bad.write_bytes(b"this is not audio")
    if shutil.which("ffmpeg") is None:
        pytest.skip("ffmpeg not installed")
    with pytest.raises(RuntimeError, match="normalization failed"):
        engine.normalize_to_pcm_wav(str(bad))
    assert not [p for p in os.listdir(engine.TEMP_DIR) if p.startswith("norm_")], "partial output must be cleaned up"


# ------------------------------------------------------------------------- image


class FakeResponse:
    def __init__(self, content=b"\xff\xd8jpeg", content_type="image/jpeg"):
        self.content = content
        self.headers = {"Content-Type": content_type}

    def raise_for_status(self):
        pass


def test_image_clamps_size_and_encodes_prompt(tmp_path, monkeypatch):
    seen = {}

    def fake_get(url, timeout):
        seen["url"] = url
        return FakeResponse()

    monkeypatch.setattr(engine.requests, "get", fake_get)
    engine.generate_image_pollinations("a/b? c&d", str(tmp_path / "i.jpg"), width=99999, height=1)
    assert "width=2048" in seen["url"] and "height=64" in seen["url"]
    assert "a%2Fb%3F%20c%26d" in seen["url"], "slashes and ampersands in prompts must be escaped"


def test_image_rejects_non_image_responses(tmp_path, monkeypatch):
    monkeypatch.setattr(engine.requests, "get", lambda url, timeout: FakeResponse(b"<html>rate limited</html>", "text/html"))
    with pytest.raises(RuntimeError, match="unexpected response"):
        engine.generate_image_pollinations("cat", str(tmp_path / "i.jpg"))


# ------------------------------------------------------------------------- video


@needs_ffmpeg
def test_video_fallback_is_labelled_as_not_neural(tmp_path, monkeypatch):
    def fake_image(prompt, output_path=None, width=720, height=720):
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=1", "-frames:v", "1", output_path],
            check=True,
        )
        return output_path

    monkeypatch.setattr(engine, "generate_image_pollinations", fake_image)
    monkeypatch.setattr(engine, "Client", None)
    out, info = engine.generate_video_open("a calm sea", seconds=2.0, output_path=str(tmp_path / "v.mp4"))
    assert info["method"] == "keyframe-morph"
    assert "gradio_client" in info["remote_error"]
    assert os.path.getsize(out) > 1000


# -------------------------------------------------------------------- CLI contract


def cli(*args):
    proc = subprocess.run([sys.executable, ENGINE_PY, *args], capture_output=True, text=True, cwd=ROOT)
    return proc.returncode, proc.stdout.strip(), proc.stderr


def test_cli_without_arguments_prints_usage_as_json():
    code, out, _ = cli()
    data = json.loads(out)
    assert code == 1 and data["success"] is False and "Usage" in data["error"]


def test_cli_rejects_unknown_actions_and_missing_arguments():
    code, out, _ = cli("bogus")
    assert code == 1 and "Unknown action" in json.loads(out)["error"]
    code, out, _ = cli("sfx")
    assert code == 1 and "requires an argument" in json.loads(out)["error"]


def test_cli_check_reports_capabilities():
    code, out, _ = cli("check")
    data = json.loads(out)
    assert code == 0 and data["success"] is True
    assert set(data["modules"]) >= {"numpy", "scipy", "edge_tts", "speech_recognition", "gradio_client"}
    assert isinstance(data["ffmpeg"], bool)


def test_cli_sfx_prints_exactly_one_json_object(tmp_path):
    out_wav = tmp_path / "cli.wav"
    payload = tmp_path / "req.json"
    payload.write_text(json.dumps({"prompt": "door knock", "duration": 1.0, "output_path": str(out_wav)}))
    code, out, _ = cli("sfx", str(payload))
    assert code == 0
    assert len(out.splitlines()) == 1, "the Node server parses stdout; extra lines are noise"
    data = json.loads(out)
    assert data["success"] is True and data["method"] == "procedural"
    assert out_wav.exists()


def test_cli_failure_exits_nonzero_with_json_error(tmp_path):
    payload = tmp_path / "req.json"
    payload.write_text("{not json")
    code, out, _ = cli("sfx", str(payload))
    assert code == 1 and json.loads(out)["success"] is False


def test_cli_does_not_import_fastapi():
    """FastAPI is only for the optional HTTP layer; importing it per request is wasted start-up time."""
    code = (
        "import sys, runpy\n"
        "sys.argv = ['audio_engine.py', 'check']\n"
        "try:\n"
        "    runpy.run_path('audio_engine.py', run_name='__main__')\n"
        "except SystemExit:\n"
        "    pass\n"
        "print('fastapi' in sys.modules)\n"
    )
    proc = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=ROOT)
    assert proc.stdout.strip().splitlines()[-1] == "False"
