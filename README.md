<div align="center">
  <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/audio-lines.svg" width="60" alt="ElevenOpen Studio Icon" />
  
  # ElevenOpen Studio
  
  **Open-Access Audio & Media Synthesis Suite**
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
  [![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)](https://fastapi.tiangolo.com/)
  
  <p align="center">
    A comprehensive, open-source web application for audio and visual synthesis. Providing a unified, beautifully designed interface for various audio and media generation tasks, utilizing open-access neural models and procedural synthesis techniques.
  </p>
</div>

<br />

<div align="center">
  <img src="./assets/screenshot.png" alt="ElevenOpen Studio App Screenshot" width="800" style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);" />
</div>

<br />

## 🌟 Key Features

- **🗣️ Speech Synthesis (TTS):** Generate expressive, natural-sounding neural speech from text with zero latency using multilingual endpoints.
- **🎙️ Voice Lab & Clone:** Analyze and extract acoustic profiles (F0, spectral centroid, timbre) to clone voices from reference audio.
- **💥 Sound Effects & SFX:** Generate high-fidelity procedural Foley effects (e.g., footsteps, cinematic impacts, UI clicks) and neural text-to-audio.
- **🌊 Ambient Soundscapes:** Create continuous, rich environmental backgrounds and deep acoustic soundscapes.
- **🖼️ Visuals & Image:** Generate static visual assets dynamically using Pollinations API integrations.
- **🎬 Video Studio:** Create authentic multi-frame neural diffusion video with true fluid dynamics, character motion, and cinematic lighting at 24fps.
- **📝 Speech to Text:** Accurate transcription using integrated STT fallback capabilities.

## 🏗️ Architecture Under the Hood

The project is built on a modern, decoupled architecture:
- **Backend (Python):** Powered by **FastAPI** for high-performance API routing. Utilizes `numpy`, `scipy`, and `ffmpeg` for deep procedural audio manipulation, filtering, and normalization. Includes asynchronous Edge-TTS integrations.
- **Frontend (TypeScript):** A responsive, dark-mode focused UI built with **React**, **Vite**, and **Tailwind CSS**.
- **Media Pipeline:** Relies heavily on **FFmpeg** to guarantee output consistency across various audio codecs, resampling rates, and video encodings (H.264/WebM compatibility).

## 🚀 Getting Started

Follow these steps to get the studio running on your local machine.

### Prerequisites

- **Node.js** (v18 or higher recommended)
- **Python** (3.9 or higher)
- **FFmpeg** (Must be installed and accessible in your system `PATH`)

---

### 1. Backend Setup

First, install the required Python dependencies.

```bash
# It is recommended to use a virtual environment
pip install -r requirements.txt

# Ensure core audio engines are installed
pip install edge-tts scipy numpy speechrecognition
```

Start the FastAPI backend:
```bash
python audio_engine.py
```
*Note: The backend runs natively and handles heavy audio processing and neural network routing.*

### 2. Frontend Setup

In a new terminal window, install the Node.js dependencies:

```bash
# Using npm
npm install

# Or using bun
bun install
```

Copy the environment variables template:
```bash
cp .env.example .env
```
*(Optionally, add any specific API keys to your `.env` file).*

Start the Vite development server:
```bash
npm run dev
# Or using bun: bun run dev
```

Your app will be live at `http://localhost:5173` (or the port displayed in your terminal).

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.
