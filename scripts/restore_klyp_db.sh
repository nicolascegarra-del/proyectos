#!/usr/bin/env bash
#
# restore_klyp_db.sh — Restaura un backup .dump de la BD PostgreSQL de Klyp
#
# Uso:
#   ./restore_klyp_db.sh ./backups/klyp_klyp_20260604_153000.dump
#
# Restaura sobre la BD existente con --clean --if-exists (recrea los objetos).
# Auto-detecta el contenedor de Postgres (compatible con Coolify).
#
set -euo pipefail

PG_USER="klyp"
PG_DB="klyp"

BACKUP_FILE="${1:-}"
if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: indica un fichero de backup válido." >&2
  echo "Uso: $0 ./backups/klyp_klyp_YYYYMMDD_HHMMSS.dump" >&2
  exit 1
fi

echo "==> Buscando el contenedor de PostgreSQL..."
DB_CONTAINER="$(docker ps --filter "ancestor=postgres:16-alpine" --format '{{.Names}}' | head -n1)"
if [ -z "${DB_CONTAINER:-}" ]; then
  DB_CONTAINER="$(docker ps --format '{{.Names}}\t{{.Image}}' | grep -i postgres | head -n1 | cut -f1)"
fi
if [ -z "${DB_CONTAINER:-}" ]; then
  echo "ERROR: no se encontró ningún contenedor de PostgreSQL en ejecución." >&2
  exit 1
fi
echo "    Contenedor detectado: $DB_CONTAINER"

echo ""
echo "⚠️  Vas a RESTAURAR sobre la base de datos '$PG_DB' del contenedor '$DB_CONTAINER'."
echo "    Backup: $BACKUP_FILE"
read -r -p "    ¿Continuar? Escribe 'si' para confirmar: " CONFIRM
if [ "$CONFIRM" != "si" ]; then
  echo "Cancelado."
  exit 0
fi

echo "==> Copiando backup al contenedor..."
docker cp "$BACKUP_FILE" "$DB_CONTAINER:/tmp/restore.dump"

echo "==> Restaurando (esto puede tardar)..."
docker exec "$DB_CONTAINER" pg_restore -U "$PG_USER" -d "$PG_DB" --clean --if-exists /tmp/restore.dump
docker exec "$DB_CONTAINER" rm -f /tmp/restore.dump

echo ""
echo "✅ Restauración completada desde: $BACKUP_FILE"
echo "   Reinicia el backend si hace falta para que tome la BD restaurada."
