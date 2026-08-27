#!/usr/bin/env bash
# tunnel-serveo.sh — Tunnel público para el CRM
# Expone localhost:3030 via serveo.net
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

CRM_PORT="${CRM_PORT:-3030}"
TUNNEL_LOG="data/serveo-tunnel.log"
mkdir -p data

echo "🚇 Iniciando túnel serveo para puerto ${CRM_PORT}..."
echo "   Log: ${TUNNEL_LOG}"

while true; do
  ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 \
      -o ExitOnForwardFailure=yes \
      -R 80:localhost:${CRM_PORT} serveo.net 2>&1 | tee -a "${TUNNEL_LOG}"
  echo "🔄 Túnel caído. Reconectando en 10s..."
  sleep 10
done
