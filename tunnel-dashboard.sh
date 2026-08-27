#!/usr/bin/env bash
# tunnel-dashboard.sh — Túnel público para el Dashboard vía localhost.run
# Expone localhost:3031 a internet
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"

DASHBOARD_PORT="${DASHBOARD_PORT:-3031}"
TUNNEL_LOG="$DIR/data/dashboard-tunnel.log"
mkdir -p "$DIR/data"

echo "🚇 Iniciando túnel localhost.run para Dashboard puerto ${DASHBOARD_PORT}..."
echo "   Log: ${TUNNEL_LOG}"

while true; do
  ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 \
      -o ExitOnForwardFailure=yes \
      -R 80:localhost:${DASHBOARD_PORT} nokey@localhost.run 2>&1 | tee -a "${TUNNEL_LOG}"
  echo "🔄 Túnel caído. Reconectando en 10s..." | tee -a "${TUNNEL_LOG}"
  sleep 10
done
