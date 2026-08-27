#!/usr/bin/env bash
# start-usb-bridge.sh — Puente USB → Docker para CRM
#
# Detecta automáticamente la interfaz USB tethering de la tableta,
# levanta un socat que redirige tráfico al contenedor Docker del CRM.
#
# Uso: ./start-usb-bridge.sh
#      ./start-usb-bridge.sh --monitor   (monitorea cambios de IP)
#
# Requisitos: socat instalado (sudo apt install socat)
#
# Nota: el CRM debe estar corriendo en el contenedor (./start-tablet)

set -e

CRM_DOCKER_IP="${CRM_CONTAINER:-172.18.0.2}"
CRM_PORT="${CRM_PORT:-3030}"
SOCAT_PID=""
MONITOR_MODE=false

for arg in "$@"; do
  [ "$arg" = "--monitor" ] && MONITOR_MODE=true
done

# ── Detectar interfaz USB tethering ──
detect_usb_iface() {
  # Busca interfaces USB Ethernet (enx*) activas con IP
  for iface in /sys/class/net/enx*; do
    [ -d "$iface" ] || continue
    name=$(basename "$iface")
    operstate=$(cat "$iface/operstate" 2>/dev/null || echo "unknown")
    [ "$operstate" = "up" ] || continue
    ip=$(ip -4 addr show "$name" 2>/dev/null | awk '/inet /{split($2,a,"/"); print a[1]}')
    [ -n "$ip" ] && echo "$name" && return 0
  done

  # Fallback: busca pan* (Bluetooth PAN) activas
  for iface in /sys/class/net/pan*; do
    [ -d "$iface" ] || continue
    name=$(basename "$iface")
    operstate=$(cat "$iface/operstate" 2>/dev/null || echo "unknown")
    [ "$operstate" = "up" ] || continue
    ip=$(ip -4 addr show "$name" 2>/dev/null | awk '/inet /{split($2,a,"/"); print a[1]}')
    [ -n "$ip" ] && echo "$name" && return 0
  done

  # Último recurso: cualquier interfaz que no sea loopback ni Docker
  for iface in /sys/class/net/*; do
    name=$(basename "$iface")
    case "$name" in
      lo|docker*|br-*|veth*|tun*) continue ;;
    esac
    operstate=$(cat "$iface/operstate" 2>/dev/null || echo "unknown")
    [ "$operstate" = "up" ] || continue
    ip=$(ip -4 addr show "$name" 2>/dev/null | awk '/inet /{split($2,a,"/"); print a[1]}')
    # Filtra IPs de Docker y locales
    case "$ip" in
      172.1[7-9].*|172.2[0-9].*|172.3[0-1].*|127.*|169.254.*) continue ;;
    esac
    [ -n "$ip" ] && echo "$name" && return 0
  done

  echo ""
}

# ── Obtener IP de una interfaz ──
get_ip() {
  ip -4 addr show "$1" 2>/dev/null | awk '/inet /{split($2,a,"/"); print a[1]}'
}

# ── Iniciar puente socat ──
start_bridge() {
  local iface="$1"
  local ip="$2"

  # Mata socat anterior si existe
  stop_bridge

  echo "  🔗 Puente: $iface ($ip) → $CRM_DOCKER_IP:$CRM_PORT"
  socat "TCP-LISTEN:$CRM_PORT,bind=$ip,fork,reuseaddr" "TCP:$CRM_DOCKER_IP:$CRM_PORT" &
  SOCAT_PID=$!

  echo "  ✅ socat PID $SOCAT_PID"
  echo "  ════════════════════════════════════════════"
  echo "   ▶ En Termux:"
  echo ""
  echo "    CRM_URL=http://$ip:$CRM_PORT node wa-tablet.cjs NUMERO"
  echo "   ════════════════════════════════════════════"
}

# ── Detener puente ──
stop_bridge() {
  [ -n "$SOCAT_PID" ] && kill "$SOCAT_PID" 2>/dev/null || true
  SOCAT_PID=""
}

# ── Limpieza al salir ──
cleanup() {
  echo ""; echo "  🛑 Deteniendo puente USB..."
  stop_bridge
  exit 0
}
trap cleanup INT TERM

# ═══════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════

echo "╔═══════════════════════════════════════════════╗"
echo "║  🔌 PUENTE USB → DOCKER                      ║"
echo "║  Tableta ↔ laptop ↔ contenedor CRM            ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

IFACE=$(detect_usb_iface)

if [ -z "$IFACE" ]; then
  echo "  ❌ No se detectó ninguna interfaz USB/BT activa."
  echo "  Conecta la tableta por USB y activa USB Tethering."
  echo ""
  echo "  Interfaces disponibles:"
  ip -4 addr show 2>/dev/null | grep -E '^[0-9]|inet ' | grep -v '127.0.0.1' || true
  exit 1
fi

IP=$(get_ip "$IFACE")
echo "  📡 Interfaz detectada: $IFACE → $IP"
echo ""

start_bridge "$IFACE" "$IP"

# ── Modo monitor: vigila cambios de IP ──
if [ "$MONITOR_MODE" = true ]; then
  echo ""
  echo "  👀 Monitor activo (revisa cada 10s)..."
  while true; do
    sleep 10
    NEW_IP=$(get_ip "$IFACE")
    if [ -n "$NEW_IP" ] && [ "$NEW_IP" != "$IP" ]; then
      echo "  🔄 IP cambió: $IP → $NEW_IP. Reconfigurando..."
      IP="$NEW_IP"
      start_bridge "$IFACE" "$IP"
    fi
    # Si la interfaz desapareció, busca una nueva
    if [ ! -d "/sys/class/net/$IFACE" ]; then
      NEW_IFACE=$(detect_usb_iface)
      if [ -n "$NEW_IFACE" ]; then
        echo "  🔄 Interfaz cambió: $IFACE → $NEW_IFACE. Reconfigurando..."
        IFACE="$NEW_IFACE"
        IP=$(get_ip "$IFACE")
        start_bridge "$IFACE" "$IP"
      fi
    fi
  done
fi

wait
