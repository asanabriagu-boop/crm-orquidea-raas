#!/usr/bin/env bash
# wa-boot-tablet.sh — Arranque automático de la tableta WhatsApp (Termux:Boot)
#
# Este script lo ejecuta la app "Termux:Boot" al encender la tableta.
# Conecta la tableta (Baileys) al CRM de la laptop por LAN, con reintento
# automático si la red aún no está lista o si Bluetooth/uso de celular la tumba.
#
# ▶ Instalación en la tableta (Termux):
#   termux-setup-storage
#   pkg install termux-services         # opcional, para que sobreviva
#   mkdir -p ~/.termux/boot
#   cp wa-boot-tablet.sh ~/.termux/boot/
#   chmod +x ~/.termux/boot/wa-boot-tablet.sh
#   # Descargar/actualizar el script de WhatsApp + deps en ~/wa (una sola vez):
#   #   cd ~ && mkdir -p wa && cd wa
#   #   curl -o wa-tablet.cjs "http://IP_LAN:3030/api/tablet-script"
#   #   npm init -y && npm install @whiskeysockets/baileys pino qrcode-terminal
#
# ▶ Configuración antes de usar (edita estas variables):
#   CRM_IP  → IP LAN de la laptop (resérvala en el router por el MAC del host
#             para que no cambie; MAC host ethernet: c8:5b:76:cd:c7:67)
#   PHONE   → número de WhatsApp que vincula este dispositivo (con código país)
#   TENANT  → slug del tenant QUE RESPONDE DESDE ESTE DISPOSITIVO. CRÍTICO:
#             wa-tablet.cjs enruta por esta variable. Si se omite el bridge
#             responde como el tenant por defecto (mototractor). Para la línea
#             de Stably → TENANT="motostabily".
#
# ▶ Para que el script NO muera al cerrar la app Termux, ejecuta en Termux:
#   termux-wake-lock
# (o usa la opción con tmux / setsid abajo). Sin esto, cerrar la app o que
# el sistema mate el proceso de fondo tumba el puente.

set -u

# ── CONFIG ──
CRM_IP="192.168.0.4"
CRM_PORT="3030"
PHONE="573214171508"
TENANT="motostabily"
WORKDIR="${HOME}/wa"           # ruta donde está descargado wa-tablet.cjs
LOG="${HOME}/wa-boot.log"      # log de arranque/reintentos
# ────────────

CRM_URL="http://${CRM_IP}:${CRM_PORT}"

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

ensure_node() {
  # En Termux el paquete se llama nodejs; si no existe, instalarlo.
  if ! command -v node >/dev/null 2>&1; then
    log "node no encontrado, instalando nodejs..."
    pkg install -y nodejs >> "$LOG" 2>&1
  fi
}

log "=== Iniciando WhatsApp bridge (tableta) ==="
ensure_node

# Si no hay red aún, esperar a que el host responda (máx ~120s)
echo "  ⏳ Esperando al CRM en ${CRM_URL} ..."
for i in $(seq 1 60); do
  if node -e 'fetch(process.argv[1]).then(()=>process.exit(0)).catch(()=>process.exit(1))' "${CRM_URL}/api/discover" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "  🚀 Lanzando wa-tablet.cjs (número ${PHONE}, tenant ${TENANT}) ..."
log "Lanzando wa-tablet.cjs con CRM_URL=${CRM_URL} TENANT=${TENANT}"

# Bucle de reinicio: si el puente muere (corte de red, sesión), lo relanza.
while true; do
  cd "$WORKDIR" || { log "ERROR: no existe $WORKDIR"; exit 1; }
  CRM_URL="$CRM_URL" TENANT="$TENANT" PHONE="$PHONE" node wa-tablet.cjs "$PHONE" >> "$LOG" 2>&1
  echo "  ⚠️  El puente terminó. Reintentando en 10s..."
  log "Puente terminó (código $?). Reintentando en 10s..."
  sleep 10
done
