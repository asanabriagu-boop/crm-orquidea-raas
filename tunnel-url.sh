#!/usr/bin/env bash
# tunnel-url.sh — Muestra la URL pública del túnel serveo
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$DIR/data/serveo-tunnel.log"
if [ -f "$LOG" ]; then
  URL=$(grep -oP 'https://[^\s]+\.serveousercontent\.com' "$LOG" 2>/dev/null | head -1)
  if [ -n "$URL" ]; then
    echo "$URL"
  else
    echo "(esperando túnel...)"
  fi
else
  echo "(sin túnel activo)"
fi
