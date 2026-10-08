<div align="center">
  <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/audio-lines.svg" width="60" alt="ElevenOpen Studio Icon" />

  # ElevenOpen Studio

  **Open-access audio & media synthesis in one web UI**

  [![CI](https://github.com/nurik-dz/open-access-audio/actions/workflows/ci.yml/badge.svg)](https://github.com/nurik-dz/open-access-audio/actions/workflows/ci.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
  [![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)
  [![Python](https://img.shields.io/badge/Python-3.10+-green.svg)](https://www.python.org/)

  <p align="center">
    A web app for text-to-speech, speech-to-text, voice matching and cloning, sound effects, images and short videos,
    built on free public endpoints and local audio processing. No paid API keys required.
  </p>
</div>

<br />

<div align="center">
  <img src="./assets/screenshot.png" alt="ElevenOpen Studio App Screenshot" width="800" />
</div>

<br />

## What it does, and what actually runs

Everything here works without an account. Several features have a **local fallback** so the app stays usable when a
free public service is busy or offline. The UI tells you when a fallback produced your result.

| Feature | Primary path | Fallback |
|---|---|---|
| **Speech synthesis** | Microsoft Edge neural voices via [`edge-tts`](https://github.com/rany2/edge-tts) (needs internet) | None |
| **Speech to text** | Google Web Speech via `SpeechRecognition` (needs internet) | None |
| **Voice Lab: analysis** | Local pitch (F0) and spectral-centroid measurement (NumPy/SciPy) | n/a |
| **Voice Lab: cloning** | Zero-shot [F5-TTS](https://huggingface.co/spaces/mrfakename/E2-F5-TTS) Space, **only when you supply a Hugging Face token** | Local *voice match*: the closest stock Edge voice with pitch and EQ adjustments. This is not a clone, and the UI says so. |
| **Sound effects** | AudioLDM2 Space, when you supply a token | Built-in procedural synthesizer. It is keyword driven (knock, punch, footsteps, laser, rain, ...), not a neural model. |
| **Ambient soundscapes** | Stable Audio Open Space, when you supply a token | Same procedural synthesizer |
| **Images** | [Pollinations](https://pollinations.ai/) (needs internet) | None |
| **Video** | AnimateDiff-Lightning Space: about 1.6 s of neural motion, looped and upscaled with FFmpeg. Other Spaces are tried when you supply a token. | Cross-dissolve between two generated stills, labelled "Not AI-generated motion" |

Free public Spaces are rate limited and sometimes asleep; expect occasional fallbacks and slow first requests.

## Architecture

```
Browser (React 19 + Vite + Tailwind)
   │  fetch /api/*
   ▼
Express server  (server.ts, server/)         validation, rate limit, concurrency cap, temp-file hygiene
   │  spawns one process per job, JSON on stdout
   ▼
audio_engine.py                              DSP (NumPy/SciPy), FFmpeg, edge-tts, gradio_client
   ├─ Microsoft Edge TTS · Google Web Speech · Hugging Face Spaces · Pollinations
   └─ FFmpeg for normalization, transcoding and video assembly
```

- **Frontend** (`src/`): React 19, Vite, Tailwind CSS 4. Each tab is code-split. History lives in IndexedDB.
- **Server** (`server.ts`, `server/`): Express. Validates and clamps every input, rate limits generation endpoints,
  caps concurrent engine processes, kills runaway jobs, and removes scratch files after every request.
- **Engine** (`audio_engine.py`): a CLI that takes an action plus a JSON payload and prints exactly one JSON object.
  It can also run as a standalone HTTP API (see below).

## Getting started

### Prerequisites

- **Node.js** 18 or newer (22 recommended)
- **Python** 3.10 or newer
- **FFmpeg** on your `PATH`

### Install and run

```bash
# 1. Python dependencies (a virtual environment is recommended)
pip install -r requirements.txt

# 2. Node dependencies
npm install

# 3. Optional configuration
cp .env.example .env

# 4. Start the app (Vite dev server + API on one port)
npm run dev
```

Open **http://127.0.0.1:3000**. The badge in the header shows whether the engine is ready. If it says **Setup
Needed**, hover it, or look at the server console, for the exact missing piece (FFmpeg, a Python package, ...).

### Production build

```bash
npm run build
npm start        # serves dist/ and the API from one process
```

### Configuration

All variables are optional; see [`.env.example`](.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `HOST` | `127.0.0.1` | Interface to bind. Keep loopback unless you trust the network (see Security). |
| `PORT` | `3000` | Port to listen on |
| `HF_TOKEN` | none | Hugging Face token used when the UI doesn't supply one |
| `PYTHON` | `python3` (`python` on Windows) | Interpreter used to run the engine |
| `MAX_CONCURRENT_JOBS` | `2` | Engine processes running at once; extra jobs queue |
| `RATE_LIMIT_PER_MINUTE` | `30` | `POST /api/*` requests per client IP per minute |
| `ENGINE_TIMEOUT_MS` | `300000` | A job is killed after this long |
| `MAX_BODY_MB` | `50` | Upload and JSON body limit |

## Security notes

This is a **local tool**, not a hardened multi-user service.

- It binds to `127.0.0.1` by default. The API has **no authentication**, and each request can run FFmpeg or call remote
  GPU Spaces. If you set `HOST=0.0.0.0`, put it behind a reverse proxy with authentication.
- A Hugging Face token you enter in the UI is sent to your own server and on to Hugging Face. The Video tab
  also keeps it in your browser's `localStorage`. Use a read-only token.
- Inputs are validated and clamped server-side, scratch files are created with owner-only permissions and are always
  deleted, and uploads are size limited.

## Optional: standalone HTTP engine

The web app talks to the engine through its CLI. If you want the engine as a plain HTTP service instead:

```bash
uvicorn audio_engine:app --port 8000   # POST /api/sfx, /api/ambient, /api/image, /api/video
```

## Development

```bash
npm run lint       # TypeScript typecheck
npm test           # server tests (Node test runner, fake engine, no Python needed)
pip install -r requirements-dev.txt
npm run test:py    # engine tests (pytest, fully offline)
```

CI runs all of the above plus a production build on every push and pull request.

## Known limitations

- TTS and STT need internet access; there is no offline speech model yet.
- The local voice match chooses among a handful of stock voices, so it will not sound like the reference speaker.
  Real cloning needs the F5-TTS Space and a token.
- The procedural sound effects only understand a small set of keywords.
- Video clips are short (2-10 s) and the neural part is only about 1.6 s of motion that gets looped.

## Contributing

1. Fork the project
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run `npm run lint && npm test && npm run test:py`
4. Commit your changes and open a pull request

## License

Distributed under the MIT License. See [`LICENSE`](LICENSE).
