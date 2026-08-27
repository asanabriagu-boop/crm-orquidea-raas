#!/usr/bin/env bash
# start-tunnel.sh — Túnel público persistente para el CRM
# Usa localhost.run para exponer el puerto CRM_PORT
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

CRM_PORT="${CRM_PORT:-3030}"
TUNNEL_LOG="data/tunnel.log"
mkdir -p data

echo "🚇 Iniciando túnel localhost.run para puerto ${CRM_PORT}..."
echo "   Log: ${TUNNEL_LOG}"

while true; do
  ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 \
      -o ExitOnForwardFailure=yes \
      -R 80:localhost:${CRM_PORT} nokey@localhost.run 2>&1 | tee -a "${TUNNEL_LOG}"
  echo "🔄 Túnel caído. Reconectando en 10s..." | tee -a "${TUNNEL_LOG}"
  sleep 10
done
