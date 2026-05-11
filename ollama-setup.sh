#!/bin/sh

# Script de inicialización para Aura-Docker
# Ollama usa la variable de entorno OLLAMA_HOST para apuntar a un servidor remoto

export OLLAMA_HOST="http://ollama:11434"

echo "🤖 Aura-Setup: Esperando a que el cerebro (Ollama) despierte en $OLLAMA_HOST..."

# Esperar a que ollama responda
until ollama list > /dev/null 2>&1; do
  echo "⏳ Ollama aún no está listo, reintentando en 5s..."
  sleep 5
done

echo "✅ Ollama está activo. Iniciando el Escuadrón de Agentes..."

MODELS="llama3.2:3b llava:7b qwen2.5-coder:7b"

for MODEL in $MODELS; do
  echo "📥 Verificando especialista: $MODEL..."
  if ollama list | grep -q "$MODEL"; then
    echo "✅ $MODEL ya está disponible, saltando descarga."
  else
    echo "⬇️ Descargando $MODEL... (esto puede tardar varios minutos)"
    ollama pull $MODEL
    echo "✅ Especialista $MODEL descargado y listo."
  fi
done

echo "🚀 ¡Escuadrón de Agentes completo! Aura tiene todo su cerebro disponible."
