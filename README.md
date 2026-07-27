# Agentic Website RAG Chatbot

A fully local, privacy-first AI chatbot that scrapes any website and lets you chat with it — powered by Ollama, ChromaDB, and an agentic scraping pipeline.

## What It Does

1. You enter a website URL
2. An intelligent scraping agent analyzes the site and picks the right strategy (static HTML or browser rendering)
3. Pages are discovered, cleaned, chunked, and embedded
4. You chat with the website using natural language
5. Every answer is grounded in the actual scraped content — no hallucinations

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| LLM | Ollama (Mistral 7B) |
| Embeddings | Ollama (nomic-embed-text) |
| Vector Store | ChromaDB |
| Database | SQLite |
| Scraping | Cheerio (static) + Puppeteer (dynamic) |

## Prerequisites

- **Node.js** 18+
- **Ollama** — [ollama.ai](https://ollama.ai)
- **ChromaDB** — `pip install chromadb`

## Quick Start

```bash
# 1. Clone and set up environment
cp .env.example backend/.env

# 2. Install dependencies
npm run install:all

# 3. Set up the database
npm run setup-db

# 4. Start Ollama (in a separate terminal)
ollama pull mistral
ollama pull nomic-embed-text
ollama serve

# 5. Start ChromaDB (in a separate terminal)
chroma run --path ./data/chroma

# 6. Start the backend (in a separate terminal)
npm run dev:backend

# 7. Start the frontend (in a separate terminal)
npm run dev:frontend

# 8. Open the app
# → http://localhost:3000
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Service health check |
| POST | `/api/scrape` | Start scraping a website |
| GET | `/api/scrape/:jobId/status` | Get scrape progress |
| POST | `/api/chat` | Chat with a scraped website |
| GET | `/api/websites` | List all scraped websites |
| GET | `/api/websites/:id` | Website details |
| DELETE | `/api/websites/:id` | Remove website |
| GET | `/api/conversations/:id` | Get conversation history |
| DELETE | `/api/conversations/:id` | Delete conversation |

## Architecture

```
React Frontend
      ↓ HTTP/REST
Express Backend
      ↓
  ┌───┴───────────────────┐
  │  Routes → Controllers │
  │        → Services     │
  └───────────────────────┘
      ↓           ↓           ↓
   SQLite      ChromaDB     Ollama
  (metadata)  (vectors)     (LLM)
```

## Implementation Phases

- ✅ **Phase 1** — Project Setup & Infrastructure
- ⬜ **Phase 2** — Database Schema & Services
- ⬜ **Phase 3** — Static Scraper
- ⬜ **Phase 4** — Agentic Scraping Layer
- ⬜ **Phase 5** — Embeddings + ChromaDB
- ⬜ **Phase 6** — RAG Pipeline
- ⬜ **Phase 7** — API Layer
- ⬜ **Phase 8** — Frontend UI
- ⬜ **Phase 9** — End-to-End Testing
