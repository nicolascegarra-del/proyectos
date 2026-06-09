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

> **Estrategia elegida: despliegue en paralelo (blue-green).**
> En vez de un cutover in-place, se levanta el proyecto v6_bd como **proyecto NUEVO
> en Coolify, en un dominio nuevo** (p. ej. `proyectos.klyp.es`), con su **BD nativa
> propia** y una **copia** de los datos de producción. El proyecto viejo (v5, Postgres
> en Docker) sigue intacto como rollback. Cuando el nuevo está validado, se elimina el viejo.

### Flujo blue-green (resumen)
1. Backup de la BD de producción (v5) **y** del volumen de uploads.
2. Postgres 16 nativo en el host con BD/rol **`proyectos`** (nombre distinto de `klyp`).
3. Restaurar el dump de prod en la BD `proyectos` + copiar los ficheros de uploads.
4. Crear el proyecto nuevo en Coolify (rama `v6_bd`, dominio nuevo) con su `DATABASE_URL`
   apuntando a `proyectos`. Ambos proyectos conviven sin colisión (ver nota).
5. Validar el nuevo (login, datos, adjuntos). El viejo sigue sirviendo tráfico hasta aquí.
6. Cambiar el dominio definitivo al nuevo y **eliminar** el proyecto viejo + su volumen.

> **Por qué no colisionan los dos proyectos en el mismo host:**
> - El compose de v6 **no fija `container_name`** (Coolify le pone prefijo de proyecto) →
>   no choca con `klyp-backend`/`klyp-frontend` del v5.
> - El frontend de v6 **no publica puerto** al host (`expose: 80` + proxy de Coolify por
>   dominio) → no choca con el `3000:80` del v5.
> - La BD nativa (`proyectos`, host:5432) y la BD Docker del v5 (`klyp`, dentro del
>   contenedor, sin puerto publicado) son **servidores distintos** → aislados.

### ⚠️ Migrar también los UPLOADS (no solo la BD)
El dump SQL **no** contiene los ficheros subidos (viven en el volumen `uploads_data`).
Cópialos del proyecto viejo al nuevo:
```bash
# Localiza el volumen de uploads del v5 (Coolify lo nombra con prefijo de proyecto)
docker volume ls | grep uploads
# Copia el contenido del volumen viejo al nuevo (ajusta los nombres reales):
docker run --rm \
  -v <volumen_uploads_v5>:/from \
  -v <volumen_uploads_v6>:/to \
  alpine sh -c "cp -a /from/. /to/"
```

---

### Pasos de detalle (building blocks)

> Ventana de mantenimiento corta. **No se borra nada del Docker viejo hasta validar.**
> Nota: para la BD nueva usa el nombre **`proyectos`** (no `klyp`) en los comandos de abajo.

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
sudo -u postgres psql -c "CREATE ROLE proyectos LOGIN PASSWORD '<PASSWORD_FUERTE>';"
sudo -u postgres psql -c "CREATE DATABASE proyectos OWNER proyectos;"
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
host    proyectos    proyectos    172.16.0.0/12    scram-sha-256
```
Aplica:
```bash
systemctl restart postgresql && systemctl enable postgresql
```

### 4. Dump de la BD de producción (origen v5)
```bash
# Para un dump consistente, congela escrituras del v5 mientras dura el dump
# (en blue-green puedes hacerlo en una ventana corta; el v5 sigue como rollback).
./scripts/backup_klyp_db.sh /var/backups/klyp     # dump de la BD 'klyp' del v5
```

### 5. Restaurar en la BD nativa nueva (`proyectos`)
El dump `-Fc` no fija el nombre de BD: se restaura en el destino que indiques con `-d`.
```bash
pg_restore --clean --if-exists --no-owner -U proyectos -d proyectos -h localhost \
  /var/backups/klyp/klyp_klyp_YYYYMMDD_HHMMSS.dump
```

### 6. Verificar paridad antes de validar
```bash
# alembic_version debe ser m3n4o5p6q7r8 (head actual)
psql -U proyectos -d proyectos -h localhost -c "SELECT version_num FROM alembic_version;"
# Conteos de filas en tablas clave (comparar con el origen v5)
psql -U proyectos -d proyectos -h localhost -c \
  "SELECT 'usuarios',count(*) FROM \"user\" UNION ALL \
   SELECT 'proyectos',count(*) FROM proyecto UNION ALL \
   SELECT 'tareas',count(*) FROM tarea;"
```
> Ajusta los nombres de tabla reales si difieren. Los conteos deben coincidir con el origen.
> No olvides copiar también los **uploads** (ver sección "Migrar también los UPLOADS").

### 7. DATABASE_URL en el proyecto nuevo de Coolify
En **Coolify → (proyecto nuevo) → Environment Variables** del servicio backend:
```
DATABASE_URL=postgresql+asyncpg://proyectos:<PASSWORD_FUERTE>@host.docker.internal:5432/proyectos
```
> El `docker-compose.yml` ya trae `extra_hosts: host.docker.internal:host-gateway`,
> así que el contenedor resuelve el host. Define también el dominio nuevo y el resto de
> env vars (SECRET_KEY, FERNET_KEY, FRONTEND_URL al dominio nuevo, etc.). Arranca el stack.
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

### 9-bis. Acceso del gestor a la BD nueva
Mismo túnel SSH, conectando al rol/BD **`proyectos`**:
```bash
ssh -L 5432:localhost:5432 usuario@vps
# DBeaver/pgAdmin → localhost:5432, BD 'proyectos', rol 'proyectos'
```

### 10. Cambio de dominio y decomisión del proyecto viejo (blue-green)
Cuando el proyecto nuevo esté validado y sirviendo el dominio definitivo:
```bash
# En Coolify: eliminar el proyecto VIEJO (v5). Eso borra sus contenedores
# (klyp-db, klyp-backend, klyp-frontend) y, si lo confirmas, sus volúmenes
# (postgres_data, uploads_data del v5).
# Hazlo SOLO tras confirmar que el nuevo tiene TODOS los datos y los uploads.
```
> Mantén un último dump del v5 archivado antes de borrar, por si acaso.

---

## Rollback

Como es **blue-green**, el rollback es trivial mientras no borres el proyecto viejo:
1. El proyecto v5 (Postgres en Docker) sigue intacto y sirviendo, o a un clic de rearrancar.
2. Si el nuevo falla, vuelves a apuntar el dominio al viejo. Cero pérdida: el v5 nunca se tocó.
3. Solo cuando el nuevo lleve 24–48 h estable, eliminas el viejo.

---

## Notas sobre los scripts

- `scripts/backup_klyp_db.sh` autodetecta el contenedor de Postgres (sirve para dumpear el
  v5). Para backups de la **BD nativa nueva** (ya sin contenedor) usa directamente:
  `pg_dump -Fc -U proyectos -d proyectos -h localhost -f <fichero>.dump`.
- Configura un cron/systemd-timer en el VPS para `pg_dump` periódico de la BD `proyectos`.
