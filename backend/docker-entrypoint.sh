#!/bin/sh
set -e

# Arranca como root SOLO para garantizar que el volumen de uploads sea escribible
# por appuser (cubre volúmenes ya existentes creados antes como root) y acto
# seguido baja privilegios: el proceso de la app (uvicorn) corre como appuser.
if [ "$(id -u)" = "0" ]; then
    chown -R appuser:appuser /app/uploads 2>/dev/null || true
    exec gosu appuser "$@"
fi

exec "$@"
