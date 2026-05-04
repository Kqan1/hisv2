# HIS APP V2

A Next.js companion app for the **AMC-1** refreshable tactile display tablet. Manages braille content, AI-assisted teaching, PDF conversion, and real-time hardware control over WiFi.

## Features

| Module | Description |
|--------|-------------|
| **Manual Writing** | Draw directly on the matrix grid and send to the tablet |
| **Notes** | Create, edit, and display multi-page tactile notes |
| **Lecture Records** | Record and replay frame-by-frame lecture sessions with audio |
| **AI Teacher** | Chat with Gemini AI that generates tactile matrix responses |
| **Voice AI Teacher** | Real-time voice conversation with AI using Gemini Live |
| **PDF to Matrix** | Upload PDFs → AI extracts text to 6-dot braille + renders simple vector graphics |
| **TTS** | ElevenLabs-powered text-to-speech, triggered via tablet keyboard (`Space+A`) |
| **Ask AI Shortcut** | Send current screen content to AI Teacher with `Space+F` on the tablet keyboard |
| **Debug** | Live device status, timing configuration, matrix testing |

## Tech Stack

- **Framework:** Next.js 16 (App Router, Turbopack)
- **Language:** TypeScript
- **Database:** PostgreSQL via Prisma ORM (Prisma Accelerate)
- **AI:** Google Gemini (text + vision), Gemini Live (real-time voice)
- **TTS:** ElevenLabs Multilingual v3
- **Hardware:** ESP32-based AMC-1 tablet (HTTP API + WebSocket)
- **UI:** Tailwind CSS, Radix UI, Lucide Icons, Sonner

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or [Prisma Accelerate](https://www.prisma.io/accelerate))
- AMC-1 tablet on the same network

### Installation

```bash
git clone https://github.com/Kqan1/hisv2.git
cd hisv2
npm install
```

### Environment Variables

Create a `.env.local` file in the project root:

```env
# Database
DATABASE_URL=postgres://user:password@host:5432/dbname

# ESP32 Tablet
NEXT_PUBLIC_ESP32_IP=192.168.4.1

# Google Gemini
GEMINI_API_KEY=your_gemini_api_key

# ElevenLabs TTS
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

### Database Setup

```bash
npx prisma generate
npx prisma migrate dev
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on the device connected to the tablet's network.

## Hardware Communication

The app communicates with the AMC-1 tablet via three channels:

| Channel | Port | Purpose |
|---------|------|---------|
| HTTP API | 80 | Display control, timing, loop, pixel commands |
| Keyboard WebSocket | 81 | Physical keyboard input (`keystate` messages) |
| Status WebSocket | 83 | Real-time device status stream (replaces HTTP polling) |

All HTTP commands go through a Next.js proxy at `/api/esp32/[...path]` to avoid CORS issues. The tablet IP can be changed at runtime from **Settings**.

### Keyboard Shortcuts (Tablet Hardware)

| Combo | Action |
|-------|--------|
| `Space + A` | Toggle text-to-speech for current content |
| `Space + F` | Send current screen to AI Teacher for explanation |
| `A` / `S` | Navigate pages (PDF viewer) |

## Project Structure

```
app/
├── ai-teacher/        # AI chat with matrix output
├── api/               # API routes (ESP32 proxy, Gemini, TTS, PDF, etc.)
├── debug/             # Developer tools & device diagnostics
├── lecture-records/    # Frame-by-frame lecture recording & playback
├── manual-writing/    # Direct matrix editing
├── notes/             # Multi-page tactile notes
├── pdf/               # PDF to braille/matrix conversion
├── settings/          # Device model, IP, power save, theme
└── voice-draw/        # Real-time voice AI with Gemini Live

hooks/                 # React hooks (useESP32, useTTS, useAskAI, etc.)
services/              # ESP32 service singleton (HTTP + WebSocket)
lib/                   # Config, braille engine, stores
types/                 # TypeScript type definitions
components/            # Shared UI components
prisma/                # Database schema
```

## API Documentation

- [`AMC1 API DOCS.md`](./AMC1%20API%20DOCS.md) — HTTP API reference for the tablet
- [`STATUS_WEBSOCKET.md`](./STATUS_WEBSOCKET.md) — Real-time status WebSocket (port 83)