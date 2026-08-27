#!/usr/bin/env bash
# duckdns-update.sh — Actualiza DuckDNS con la IP actual del host
#
# Uso:
#   DOMAIN=midominio TOKEN=mytoken ./duckdns-update.sh [--once]
#
# Con --once: ejecuta una sola vez (para cron)
# Sin --once: loop infinito cada 5 minutos
#
# Instalar en cron del HOST (ejecutar cada 5 minutos):
#   */5 * * * * cd /home/andres_sanabria/CRM && DOMAIN=YOUR_DOMAIN TOKEN=YOUR_TOKEN ./duckdns-update.sh --once >> /tmp/duckdns.log 2>&1
#
# También escribe la IP actual a /mototractor/host-ip.txt
# para que el contenedor Docker pueda leerla.

set -e

DOMAIN="${DOMAIN:-}"
TOKEN="${TOKEN:-}"
IP_FILE="/mototractor/host-ip.txt"

if [ -z "$DOMAIN" ] || [ -z "$TOKEN" ]; then
  echo "❌ Uso: DOMAIN=midominio TOKEN=mytoken $0 [--once]"
  echo "   Crea tu dominio gratis en https://duckdns.org"
  exit 1
fi

update_duckdns() {
  # Obtener IP pública actual
  local ipv4
  ipv4=$(curl -s https://api.ipify.org 2>/dev/null || curl -s https://ifconfig.me 2>/dev/null || echo "NO_IP")

  if [ "$ipv4" = "NO_IP" ]; then
    echo "⚠️ No se pudo obtener IP pública"
    return 1
  fi

  # Actualizar DuckDNS
  local response
  response=$(curl -s "https://www.duckdns.org/update?domains=${DOMAIN}&token=${TOKEN}&ip=${ipv4}" 2>/dev/null)

  if [ "$response" = "OK" ]; then
    echo "✅ DuckDNS actualizado: ${DOMAIN} → ${ipv4} ($(date '+%Y-%m-%d %H:%M:%S'))"

    # Escribir IP al archivo compartido con Docker
    echo "$ipv4" > "$IP_FILE"
    chmod 644 "$IP_FILE" 2>/dev/null || true
    return 0
  else
    echo "❌ DuckDNS error: ${response} ($(date '+%Y-%m-%d %H:%M:%S'))"
    return 1
  fi
}

# Ejecutar primera vez
update_duckdns

# Si es modo --once, salir
if [ "$1" = "--once" ]; then
  exit 0
fi

# Loop infinito cada 5 minutos
while true; do
  sleep 300
  update_duckdns
done
