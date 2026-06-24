# RTX 4060 Telemetry System

A real-time hardware telemetry stack: a Python daemon streams live laptop metrics to Supabase, a Next.js dashboard visualizes them, and a Gemini-powered AI copilot answers questions about your machine's performance.

## Architecture

```
┌──────────────┐   every 2s    ┌──────────────┐   realtime    ┌──────────────┐
│  agent.py    │ ────────────▶ │   Supabase   │ ────────────▶ │  Dashboard   │
│ (daemon)     │   insert      │  (Postgres + │   subscribe   │  (Next.js)   │
│ psutil/pynvml│               │   Realtime)  │               │   recharts   │
└──────────────┘               └──────┬───────┘               └──────┬───────┘
                                       │ query                        │ POST
                                       ▼                              ▼
                                ┌──────────────┐  ◀──────────  ┌──────────────┐
                                │ ai_server.py │   /analyze    │  AI Copilot  │
                                │ (FastAPI +   │   tool call   │   chat box   │
                                │  Gemini)     │               │              │
                                └──────────────┘               └──────────────┘
```

## Metrics collected

CPU, RAM, GPU & VRAM utilization, GPU temperature, GPU power draw / core clock / fan speed,
disk usage, network throughput (up/down KB/s), and battery level + charging state.

## Project structure

- **`backend/`** — Python (managed with [uv](https://docs.astral.sh/uv/))
  - `agent.py` — hardware daemon; samples metrics and streams them to Supabase
  - `ai_server.py` — FastAPI server exposing the Gemini copilot at `POST /api/copilot/analyze`
- **`dashboard/`** — Next.js 16 + React 19 + Recharts dashboard with Supabase Auth and realtime

## Setup

### 1. Backend

```bash
cd backend
cp .env.example .env      # then fill in your Supabase + Gemini credentials
uv sync
```

Run the daemon (streams telemetry) and the AI server in separate terminals:

```bash
uv run agent.py        # streams CPU/GPU/etc. to Supabase every 2s
uv run ai_server.py    # AI copilot API on http://127.0.0.1:8000
```

### 2. Dashboard

```bash
cd dashboard
cp .env.local.example .env.local   # fill in your Supabase URL + anon key
npm install
npm run dev                        # http://localhost:3000
```

## Database schema

The `telemetry` table (see your Supabase project) holds one row per sample:

| column | type | notes |
|--------|------|-------|
| `cpu_usage`, `ram_usage`, `gpu_usage`, `vram_usage` | float | % |
| `gpu_temp` | float | °C |
| `gpu_power`, `gpu_clock`, `gpu_fan` | float | W / MHz / % |
| `disk_usage` | float | % of C: |
| `net_up`, `net_down` | float | KB/s |
| `battery_pct` | float | % |
| `battery_charging` | bool | |
| `user_id` | uuid | RLS tenant key |

## Notes

- GPU power/clock/fan read `0` when the GPU is in a power-saving (Optimus) sleep state; they populate under graphics load.
- All secrets live in `.env` / `.env.local` (gitignored). Never commit them.
