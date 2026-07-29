# Agentic Website RAG Chatbot

A fully local, privacy-first AI chatbot that allows users to chat with any website content using an agentic scraping pipeline and Retrieval-Augmented Generation (RAG).

The system scrapes website content, generates embeddings, stores knowledge in ChromaDB, and answers user queries using a locally running LLM through Ollama.

No external AI APIs are required — everything runs locally.

---

## Features

- 🌐 Scrape any website URL
- 🤖 Agentic scraping strategy selection
- 🔍 Supports static and dynamic websites
- 🧹 Automatic content cleaning and chunking
- 🧠 Local embeddings generation
- 📚 Vector-based semantic search using ChromaDB
- 💬 Context-aware chatbot responses
- 🛡️ Privacy-first architecture with local LLM
- 📝 Conversation history management
- 🚫 Reduced hallucination through grounded RAG responses

---

## How It Works

1. User provides a website URL
2. Scraping agent analyzes the website structure
3. Appropriate scraping strategy is selected:
   - Static HTML scraping using Cheerio
   - Browser rendering using Puppeteer
4. Extracted content is cleaned and divided into chunks
5. Chunks are converted into embeddings
6. Embeddings are stored in ChromaDB
7. User asks questions about the website
8. Relevant context is retrieved and sent to Ollama Mistral
9. AI generates an answer based only on retrieved website content

---

# Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite |
| Backend | Node.js + Express |
| LLM | Ollama (Mistral 7B) |
| Embeddings | Ollama (nomic-embed-text) |
| Vector Database | ChromaDB |
| Metadata Database | SQLite |
| Static Scraping | Cheerio |
| Dynamic Scraping | Puppeteer |

---

# System Requirements

Before running the project, install:

- Node.js 18+
- Ollama
- ChromaDB
- Python (for ChromaDB)

---

# Local Setup

## 1. Clone Repository

```bash
git clone <repository-url>

cd agentic-website-rag-chatbot
