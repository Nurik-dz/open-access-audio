# Open-Access Audio Suite

A comprehensive open-source web application for audio and visual synthesis. This suite provides a unified interface for various audio and media generation tasks, utilizing open-access models and procedural synthesis techniques.

## Features

- **Text-to-Speech (TTS):** Generate natural-sounding speech from text using high-quality voices.
- **Voice Cloning:** Analyze and clone acoustic voice profiles from reference audio.
- **Sound Effects (SFX) & Foley:** Generate high-fidelity procedural sound effects (e.g., footsteps, impacts, UI clicks, weather) or utilize text-to-audio models.
- **Ambient Soundscapes:** Create continuous environmental audio backgrounds.
- **Visual Synthesis:** Generate images and neural diffusion videos from text prompts.

## Architecture

The project is built with a modern stack:
- **Backend:** FastAPI (Python) and procedural audio engines (numpy, scipy).
- **Frontend:** React, Vite, and Tailwind CSS.
- **Media Processing:** FFmpeg for robust audio/video normalization and filtering.

## Prerequisites

- Node.js (v18+ recommended)
- Python 3.9+
- FFmpeg (must be installed and available in system PATH)

## Getting Started

### 1. Backend Setup

Install the required Python dependencies:

```bash
pip install -r requirements.txt
# Ensure edge_tts and scipy are installed
pip install edge-tts scipy
```

Start the FastAPI backend:
```bash
python audio_engine.py
# Or start via the provided unified server script if applicable
```

### 2. Frontend Setup

Install the Node.js dependencies:

```bash
npm install
# or
bun install
```

Set up your environment variables by copying the example file:
```bash
cp .env.example .env
```
*(Optionally, configure any required API keys in `.env`)*

Start the frontend development server:
```bash
npm run dev
# or
bun run dev
```

The application will be available at `http://localhost:5173` (or the port specified by Vite).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue.

## License

This project is open-source and available under the MIT License.
