#!/bin/bash

set -e

echo "Starting Ollama..."
ollama serve > /tmp/ollama.log 2>&1 &

echo "Waiting for Ollama..."
until curl -s http://127.0.0.1:11434/api/tags > /dev/null; do
    sleep 2
done

echo "Pulling Qwen model..."
ollama pull qwen2.5:1.5b

echo "Pulling embedding model..."
ollama pull nomic-embed-text

echo "Starting ChromaDB..."
chroma run \
    --host 0.0.0.0 \
    --port 8000 \
    --path /app/backend/data/chroma \
    > /tmp/chroma.log 2>&1 &

echo "Waiting for ChromaDB..."
sleep 5

echo "Starting backend..."
cd /app/backend

export NODE_ENV=production
export PORT=7860

export DATABASE_PATH=/app/backend/data/rag.db

export OLLAMA_BASE_URL=http://127.0.0.1:11434
export OLLAMA_MODEL=qwen2.5:1.5b
export OLLAMA_EMBED_MODEL=nomic-embed-text
export OLLAMA_TIMEOUT_MS=600000
export OLLAMA_TEMPERATURE=0.3
export OLLAMA_TOP_P=0.9
export OLLAMA_MAX_TOKENS=512

export CHROMADB_HOST=127.0.0.1
export CHROMADB_PORT=8000
export CHROMADB_PERSIST_DIRECTORY=/app/backend/data/chroma
export CHROMADB_COLLECTION_NAME=website_chunks

exec npm start