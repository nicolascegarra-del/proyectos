# Migración de PostgreSQL fuera de Docker (BD nativa en el host)

> Rama `v6_bd`. Objetivo: PostgreSQL 16 corre **nativo en el host** (local y VPS),
> administrable desde un gestor externo (DBeaver/pgAdmin), desacoplado del ciclo
> de vida de los contenedores. **Sin pérdida de datos** en el cutover de producción.

El backend sigue en Docker y alcanza la BD del host por `host.docker.internal:5432`
(en Linux gracias a `extra_hosts: host.docker.internal:host-gateway` del `docker-compose.yml`).

---

## Resumen de cambios de código (ya aplicados en esta rama)

- `docker-compose.yml`: eliminado el servicio `db` y el volumen `postgres_data`;
  añadido `extra_hosts` al backend; `DATABASE_URL` ahora es `${DATABASE_URL:-<default-local>}`
  (Coolify puede sobreescribirlo en producción).
- `backend/app/config.py` y `backend/app/migrations/env.py`: default/fallback a `localhost:5432`.
- `backend/.env`: `DATABASE_URL` a `localhost` con la password de dev local.
- `backend/.env.example`: documentadas las tres formas de conexión.

> ⚠️ La password de dev local por defecto es `klyp_local_dev_2026`. **Producción debe usar
> una contraseña fuerte distinta**, definida solo en las env vars de Coolify.

---

## PARTE 1 — Local (Windows) primero

### 1. Instalar PostgreSQL 16 nativo
Instalador EnterpriseDB para Windows. Durante la instalación se define la password del
superusuario `postgres`. Tras instalar, abre **SQL Shell (psql)** o pgAdmin y crea rol + BD:

```sql
CREATE ROLE klyp LOGIN PASSWORD 'klyp_local_dev_2026';
CREATE DATABASE klyp OWNER klyp;
```

> Usa exactamente esa password para que coincida con `backend/.env` y el default del compose.
> Si prefieres otra, cámbiala también en `backend/.env` y en `docker-compose.yml`.

### 2. Sacar un dump del Postgres que aún corre en Docker
Con el stack viejo todavía levantado (antes de aplicar el nuevo compose):

```bash
bash scripts/backup_klyp_db.sh ./backups
# genera ./backups/klyp_klyp_YYYYMMDD_HHMMSS.dump
```

### 3. Restaurar el dump en el Postgres nativo local
Con las **Command Line Tools** de PostgreSQL (pg_restore en el PATH):

```bash
pg_restore --clean --if-exists --no-owner -U klyp -d klyp -h localhost ^
  ./backups/klyp_klyp_YYYYMMDD_HHMMSS.dump
```
(En PowerShell usa backtick `` ` `` en vez de `^` para continuar línea, o todo en una línea.)

### 4. Arrancar el stack nuevo
```bash
docker compose up -d --build backend frontend
```
El backend en contenedor resolverá `host.docker.internal:5432` → tu Postgres nativo.

### 5. Verificar (local)
- `psql -U klyp -d klyp -h localhost -c "SELECT version_num FROM alembic_version;"` → `m3n4o5p6q7r8`
- `docker compose ps` no muestra contenedor `db`.
- `GET http://localhost:3000` y login OK; crear una tarea OK.
- Conectar DBeaver/pgAdmin a `localhost:5432` (rol `klyp`) y navegar las tablas.

---

## PARTE 2 — Producción (VPS Contabo + Coolify)

> Ventana de mantenimiento corta. **No se borra nada del Docker viejo hasta validar 24–48 h.**

### 1. Backup doble (obligatorio)
```bash
ssh vps
cd /apps/klyp
./scripts/backup_klyp_db.sh /var/backups/klyp
# + copiar el .dump FUERA del VPS (scp a tu máquina u otro almacenamiento)
```

### 2. Instalar PostgreSQL 16 nativo en el host
```bash
apt update && apt install -y postgresql-16
sudo -u postgres psql -c "CREATE ROLE klyp LOGIN PASSWORD '<PASSWORD_FUERTE>';"
sudo -u postgres psql -c "CREATE DATABASE klyp OWNER klyp;"
```

### 3. Configurar acceso (sin exponer 5432 a Internet)
`/etc/postgresql/16/main/postgresql.conf`:
```
listen_addresses = 'localhost,172.17.0.1'   # localhost + gateway del bridge docker0
password_encryption = scram-sha-256
```
> Verifica la IP real del bridge: `ip addr show docker0` (suele ser 172.17.0.1).

`/etc/postgresql/16/main/pg_hba.conf` (añade, antes de las reglas más amplias):
```
# Backend en contenedores Docker
host    klyp    klyp    172.16.0.0/12    scram-sha-256
```
Aplica:
```bash
systemctl restart postgresql && systemctl enable postgresql
```

### 4. Congelar escrituras y dump final consistente
```bash
# Parar el backend desde Coolify (o: docker compose stop backend)
# Con el backend parado, dump final del contenedor de Postgres viejo:
./scripts/backup_klyp_db.sh /var/backups/klyp     # genera el .dump definitivo
```

### 5. Restaurar en el Postgres nativo
```bash
pg_restore --clean --if-exists --no-owner -U klyp -d klyp -h localhost \
  /var/backups/klyp/klyp_klyp_YYYYMMDD_HHMMSS.dump
```

### 6. Verificar paridad antes de repuntar
```bash
# alembic_version debe ser m3n4o5p6q7r8 (head actual)
psql -U klyp -d klyp -h localhost -c "SELECT version_num FROM alembic_version;"
# Conteos de filas en tablas clave (comparar viejo vs nuevo)
psql -U klyp -d klyp -h localhost -c \
  "SELECT 'usuarios',count(*) FROM \"user\" UNION ALL \
   SELECT 'proyectos',count(*) FROM proyecto UNION ALL \
   SELECT 'tareas',count(*) FROM tarea;"
```
> Ajusta los nombres de tabla reales si difieren. Los conteos deben coincidir con el origen.

### 7. Repuntar DATABASE_URL en Coolify y arrancar
En **Coolify → Environment Variables** del servicio backend:
```
DATABASE_URL=postgresql+asyncpg://klyp:<PASSWORD_FUERTE>@host.docker.internal:5432/klyp
```
> El `docker-compose.yml` ya trae `extra_hosts: host.docker.internal:host-gateway`,
> así que el contenedor resuelve el host. Arranca el backend.
> El `alembic upgrade head` del arranque no debe aplicar nada (ya en head).

### 8. Smoke test
- `GET /health` → 200; login; listar proyectos; crear tarea; subir adjunto.
- Revisar logs del backend: sin errores de conexión.

### 9. Acceso del gestor externo (seguro, sin abrir puertos)
Túnel SSH desde tu máquina, **no** abras 5432 en el firewall:
```bash
ssh -L 5432:localhost:5432 usuario@vps
# Luego conecta DBeaver/pgAdmin a localhost:5432
```

### 10. Decomisionar (tras 24–48 h de validación)
```bash
docker compose ps                 # confirmar que ya no hay servicio db
docker volume rm <stack>_postgres_data   # SOLO cuando estés seguro
```

---

## Rollback

Si la verificación de paridad falla o el smoke test rompe:
1. Revertir `DATABASE_URL` en Coolify al valor anterior (`...@db:5432/klyp`) y restaurar
   el `docker-compose.yml` previo (servicio `db`) — los datos siguen intactos en `postgres_data`.
2. Rearrancar el stack viejo. Cero pérdida: nunca se tocó el volumen original.

---

## Notas sobre los scripts

- `scripts/backup_klyp_db.sh` autodetecta el contenedor de Postgres. **Tras el cutover ya no
  habrá contenedor**: para backups de la BD nativa usa directamente
  `pg_dump -Fc -U klyp -d klyp -h localhost -f <fichero>.dump` (o adapta el script).
- Configura un cron/systemd-timer en el VPS para `pg_dump` periódico de la BD nativa.
