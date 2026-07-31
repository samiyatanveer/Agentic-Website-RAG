FROM node:20-bookworm

WORKDIR /app

# Install Python and system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install ChromaDB
RUN pip3 install --no-cache-dir chromadb

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Copy backend source
COPY backend ./backend

# Copy startup script
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Create persistent directories
RUN mkdir -p /app/backend/data /app/backend/logs

EXPOSE 7860

CMD ["/start.sh"]