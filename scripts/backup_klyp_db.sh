#!/usr/bin/env bash
#
# backup_klyp_db.sh — Backup seguro de la BD PostgreSQL de Klyp (KRONOS)
#
# Uso:
#   ./backup_klyp_db.sh                # backup en ./backups con fecha
#   ./backup_klyp_db.sh /ruta/destino  # backup en una carpeta concreta
#
# - Auto-detecta el contenedor de Postgres (compatible con Coolify, que no
#   usa el nombre "klyp-db" sino uno generado).
# - Genera un dump comprimido (-Fc) que es el formato recomendado para restaurar.
# - Verifica que el backup no esté vacío antes de darlo por bueno.
# - Mantiene solo los últimos N backups (rotación) para no llenar el disco.
#
set -euo pipefail

# ─── Configuración ──────────────────────────────────────────────
PG_USER="klyp"            # POSTGRES_USER del docker-compose
PG_DB="klyp"              # POSTGRES_DB del docker-compose
DEST_DIR="${1:-./backups}"  # carpeta destino (por defecto ./backups)
KEEP_LAST=10              # cuántos backups conservar (rotación)
# ────────────────────────────────────────────────────────────────

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$DEST_DIR"

echo "==> Buscando el contenedor de PostgreSQL..."
# Detecta cualquier contenedor cuya imagen contenga "postgres".
DB_CONTAINER="$(docker ps --filter "ancestor=postgres:16-alpine" --format '{{.Names}}' | head -n1)"
if [ -z "${DB_CONTAINER:-}" ]; then
  # Fallback: cualquier contenedor con "postgres" en la imagen.
  DB_CONTAINER="$(docker ps --format '{{.Names}}\t{{.Image}}' | grep -i postgres | head -n1 | cut -f1)"
fi

if [ -z "${DB_CONTAINER:-}" ]; then
  echo "ERROR: no se encontró ningún contenedor de PostgreSQL en ejecución." >&2
  echo "       Revisa con: docker ps --format '{{.Names}}\t{{.Image}}'" >&2
  exit 1
fi
echo "    Contenedor detectado: $DB_CONTAINER"

OUT_FILE="$DEST_DIR/klyp_${PG_DB}_${TIMESTAMP}.dump"

echo "==> Generando backup dentro del contenedor..."
docker exec "$DB_CONTAINER" pg_dump -U "$PG_USER" -d "$PG_DB" -Fc -f /tmp/klyp_backup.dump

echo "==> Copiando backup al host: $OUT_FILE"
docker cp "$DB_CONTAINER:/tmp/klyp_backup.dump" "$OUT_FILE"
docker exec "$DB_CONTAINER" rm -f /tmp/klyp_backup.dump

# ─── Verificación: el backup debe pesar algo razonable ──────────
SIZE_BYTES="$(stat -c%s "$OUT_FILE" 2>/dev/null || stat -f%z "$OUT_FILE")"
if [ "$SIZE_BYTES" -lt 1024 ]; then
  echo "ERROR: el backup pesa solo ${SIZE_BYTES} bytes. Algo ha ido mal." >&2
  exit 1
fi
SIZE_HUMAN="$(du -h "$OUT_FILE" | cut -f1)"
echo "    Backup OK: $OUT_FILE ($SIZE_HUMAN)"

# ─── Rotación: conservar solo los últimos KEEP_LAST ─────────────
echo "==> Rotando backups (conservando los últimos $KEEP_LAST)..."
ls -1t "$DEST_DIR"/klyp_${PG_DB}_*.dump 2>/dev/null | tail -n +$((KEEP_LAST + 1)) | while read -r old; do
  echo "    Eliminando antiguo: $old"
  rm -f "$old"
done

echo ""
echo "✅ Backup completado correctamente:"
echo "   $OUT_FILE ($SIZE_HUMAN)"
echo ""
echo "Para restaurarlo si algo sale mal:"
echo "   docker cp \"$OUT_FILE\" $DB_CONTAINER:/tmp/restore.dump"
echo "   docker exec $DB_CONTAINER pg_restore -U $PG_USER -d $PG_DB --clean --if-exists /tmp/restore.dump"
