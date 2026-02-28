#!/usr/bin/env bash
#
# deploy.sh — Build Sentinel locally and deploy to the OrbStack VM
#
# Usage:
#   ./deploy.sh          Build + sync + restart container
#   ./deploy.sh sync     Sync only (skip build)
#   ./deploy.sh commands Register slash commands via container
#
set -euo pipefail

VM_HOST="openclaw-vm@orb"
VM_DIR="/home/filipefernandes/sentinel"
COMPOSE_DIR="/home/filipefernandes/openclaw"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$SCRIPT_DIR"

sync_files() {
  echo "[deploy] Syncing to ${VM_HOST}:${VM_DIR}..."
  rsync -az --delete \
    --include='dist/***' \
    --include='node_modules/***' \
    --include='config.json' \
    --include='package.json' \
    --exclude='*' \
    -e ssh \
    ./ "${VM_HOST}:${VM_DIR}/"
  echo "[deploy] Sync complete."
}

restart_container() {
  echo "[deploy] Restarting sentinel container..."
  orb run -m openclaw-vm bash -c "cd ${COMPOSE_DIR} && set -a && source .env && set +a && docker compose up -d sentinel"
  echo "[deploy] Container started."
  sleep 2
  orb run -m openclaw-vm bash -c "cd ${COMPOSE_DIR} && set -a && source .env && set +a && docker compose logs --tail 10 sentinel"
}

case "${1:-}" in
  sync)
    sync_files
    ;;
  commands)
    echo "[deploy] Registering slash commands..."
    orb run -m openclaw-vm bash -c "cd ${COMPOSE_DIR} && set -a && source .env && set +a && docker compose exec sentinel node dist/deploy-commands.js"
    ;;
  *)
    echo "[deploy] Building..."
    npm run build
    sync_files
    restart_container
    ;;
esac
