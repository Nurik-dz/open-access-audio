"""
Open-Access Audio Suite - Standalone Python FastAPI Service
Runs independently if desired on port 8000.
"""
import os
import uuid
import shutil
import asyncio
import subprocess
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import speech_recognition as sr
from gradio_client import Client, handle_file

app = FastAPI(title="Open-Access Audio Suite API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "temp_audio")
os.makedirs(TEMP_DIR, exist_ok=True)

def cleanup(path: str):
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except Exception:
            pass

@app.get("/api/health")
def health():
    return {"status": "ok", "backend": "FastAPI", "version": "1.0.0"}

@app.post("/api/tts")
async def text_to_speech(
    text: str = Form(...),
    voice: str = Form("en-US-AndrewMultilingualNeural"),
    rate: str = Form("+0%"),
    pitch: str = Form("+0Hz"),
    volume: str = Form("+0%")
):
    output_path = os.path.join(TEMP_DIR, f"tts_{uuid.uuid4().hex}.mp3")
    try:
        cmd = [
            "edge-tts",
            "--voice", voice,
            f"--rate={rate}",
            f"--pitch={pitch}",
            f"--volume={volume}",
            "--text", text,
            "--write-media", output_path
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise HTTPException(status_code=500, detail=proc.stderr)
        
        return FileResponse(output_path, media_type="audio/mpeg", filename="synthesized.mp3")
    except Exception as e:
        cleanup(output_path)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/stt")
async def speech_to_text(audio: UploadFile = File(...), language: str = Form("en-US")):
    temp_in = os.path.join(TEMP_DIR, f"stt_in_{uuid.uuid4().hex}_{audio.filename}")
    temp_wav = os.path.join(TEMP_DIR, f"stt_out_{uuid.uuid4().hex}.wav")
    
    with open(temp_in, "wb") as f:
        shutil.copyfileobj(audio.file, f)
        
    try:
        # 1. Format conversion to 16kHz Mono WAV
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', temp_in, '-ar', '16000', '-ac', '1', temp_wav])
        
        # 2. Transcribe via public web endpoint
        r = sr.Recognizer()
        with sr.AudioFile(temp_wav) as source:
            r.adjust_for_ambient_noise(source, duration=0.2)
            audio_data = r.record(source)
            text = r.recognize_google(audio_data, language=language)
            
        return {"success": True, "text": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup(temp_in)
        cleanup(temp_wav)

@app.post("/api/clone")
async def clone_voice(
    ref_audio: UploadFile = File(...),
    text: str = Form(...),
    ref_text: str = Form("")
):
    temp_ref = os.path.join(TEMP_DIR, f"clone_ref_{uuid.uuid4().hex}_{ref_audio.filename}")
    temp_out = os.path.join(TEMP_DIR, f"clone_out_{uuid.uuid4().hex}.wav")
    
    with open(temp_ref, "wb") as f:
        shutil.copyfileobj(ref_audio.file, f)
        
    try:
        client = Client("mrfakename/E2-F5-TTS")
        result = client.predict(
            ref_audio=handle_file(temp_ref),
            ref_text=ref_text,
            gen_text=text,
            remove_silence=True,
            api_name="/predict"
        )
        src = result[0] if isinstance(result, (list, tuple)) else result
        shutil.copy(str(src), temp_out)
        return FileResponse(temp_out, media_type="audio/wav", filename="cloned_voice.wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cleanup(temp_ref)
        cleanup(temp_out)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
