#!/bin/sh
# Jalankan server Ollama lalu pastikan model tersedia (pull sekali, tersimpan di volume).
set -e
ollama serve &
pid=$!
until ollama list >/dev/null 2>&1; do sleep 1; done
if ! ollama list | awk 'NR>1 {print $1}' | grep -qx "${OLLAMA_MODEL}"; then
  echo "Menarik model ${OLLAMA_MODEL} (sekali saja)..."
  ollama pull "${OLLAMA_MODEL}"
fi
wait "$pid"
