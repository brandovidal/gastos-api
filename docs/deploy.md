# Despliegue y configuración de kogane-api

kogane-api corre en **Railway**, usa **Turso** (`kogane-db`) como base y el bot de Telegram le manda los mensajes por webhook. Cada push a `main` despliega solo con GitHub Actions (`.github/workflows/deploy.yml`):

```
check (lint, build, tests) → db (migraciones + seed en kogane-db) → deploy (railway up + /v1/health) → telegram (webhook + menú)
```

Las migraciones corren **antes** que el código nuevo: tienen que funcionar también con la versión anterior (primero agregar, borrar en un deploy posterior).

## Entornos

| Entorno | Archivo o lugar | Base | Para qué |
|---|---|---|---|
| local (dev) | `.env.dev` | SQLite `file:./dev.db` | `pnpm dev` (o `make dev`), `make deps`, pruebas del bot con túnel |
| producción | Railway (variables) · GitHub (secretos) · `.env.prod` en tu máquina | Turso `kogane-db` | La API real; `make <tarea> ENV=prod` para operar a mano |
| tests | `.env.test` | SQLite `file:./test.db` | `make check` y el CI |

Los `.env*` no se suben al repo (salvo `.env.example`). Nunca pegues tokens en chats ni issues.

## Tareas (`make help`)

El `Makefile` define las variables comunes (`ENV`, archivo `.env.<ENV>`) e incluye un archivo por grupo en `makefiles/`:

| Archivo | Tareas | Uso en el despliegue |
|---|---|---|
| `makefiles/app.mk` | `dev`, `debug`, `clean` | `pnpm dev` equivale a `make dev` (local) |
| `makefiles/db.mk` | `deps`, `generate`, `db-deploy`, `migrate`, `seed`, `studio` | `make deps ENV=prod` / `make db-deploy ENV=prod` hacen a mano lo que el job `db` |
| `makefiles/bot.mk` | `telegram` | `make telegram ENV=prod URL=…` hace a mano lo que el job `telegram` |
| `makefiles/quality.mk` | `lint`, `format`, `build`, `test`, `test-integration`, `check` | `make check` es lo mismo que el job `check` |
| `makefiles/eval.mk` | `eval-replay`, `eval-ai` | no entra al despliegue; `eval-ai` gasta cuota y pide `CONFIRM=yes` |
| `makefiles/docker.mk` | `docker` | prueba local de la imagen de Railway |

`package.json` solo tiene `pnpm dev` y lo que llaman Railway (`build`, `start:prod`), el CI (`test:ci`, `test:integration`) y husky (`lint`, `format`).

## 1. Turso

1. La base de producción es `kogane-db`. Si hay que crearla: `turso db create kogane-db`.
2. URL: `turso db show kogane-db --url` → `DATABASE_URL`.
3. Token: `turso db tokens create kogane-db` → `DATABASE_AUTH_TOKEN`. Para **rotarlo** (el anterior se pegó en un chat): `turso db tokens invalidate kogane-db` y crear uno nuevo; actualizarlo en Railway, en GitHub y en `.env.prod`.

## 2. Railway

1. Crear un proyecto y un servicio vacío llamado `kogane-api` (sin conectar el repo: el deploy lo hace el workflow con `railway up`, así las migraciones siempre corren antes).
2. **Settings → Networking → Generate Domain**: la URL pública (`https://….up.railway.app`) es `PUBLIC_URL`.
3. **Variables** del servicio (las lee la app en runtime):

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` (apaga Swagger `/docs` y deja los logs en JSON) |
| `API_KEY` | una nueva: `openssl rand -hex 32` (la usa kogane-app en `x-api-key`) |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | de Turso |
| `GROQ_API_KEY`, `GEMINI_API_KEY` | claves de AI (capas gratuitas) |
| `AI_TEXT_PRIMARY` | `groq` (por defecto) o `gemini` |
| `TELEGRAM_BOT_TOKEN` | de @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | uno nuevo: `openssl rand -hex 32` |
| `TELEGRAM_ALLOWED_CHAT_IDS` | tu `chat_id` |
| `PUBLIC_URL` | la URL del paso 2 |

   `PORT` lo pone Railway. El resto de variables de `.env.example` tienen valores por defecto.
4. **Account → Tokens → Project token** del proyecto → `RAILWAY_TOKEN` (para el workflow).

`railway.json` define el build con el `Dockerfile` y el health check `/v1/health`. Plan Hobby: 5 USD/mes con 5 USD de uso incluido.

## 3. GitHub

**Settings → Environments → `production`** (se crea sola en el primer deploy si no existe) con estos **secretos**:

| Secreto | Lo usa el job |
|---|---|
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | `db` (migraciones y seed) |
| `RAILWAY_TOKEN` | `deploy` |
| `PUBLIC_URL` | `deploy` (health) y `telegram` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | `telegram` (webhook y menú) |

Opcional: la **variable** `RAILWAY_SERVICE` si el servicio no se llama `kogane-api`.

## 4. Telegram

- **Rotar el token** (el anterior se pegó en un chat): en @BotFather, `/revoke` → elegir el bot → token nuevo en Railway, GitHub y tus `.env`.
- El webhook y el menú de comandos los registra el job `telegram` en cada deploy. A mano: `make telegram ENV=prod URL=https://….up.railway.app`.
- Mientras el webhook apunta a Railway, el bot **no** responde al servidor local; para probar en local, vuelve a apuntarlo al túnel con `make telegram URL=https://<túnel>` y después redepliega (o corre el job otra vez).

## 5. Primer deploy

1. Cargar las variables (Railway) y los secretos (GitHub).
2. GitHub → **Actions → Deploy → Run workflow** (o push a `main`).
3. Revisar que pasen los 4 jobs.

## 6. Verificación

- `curl https://…/v1/health` → `database: OK` y `telegram.webhook: OK`.
- `https://…/docs` → **404** (Swagger apagado en producción).
- Desde Telegram: un texto, una foto de Yape y una nota de voz se guardan; `/uso` muestra la cuota del día.
- Imagen local igual a la de Railway: `make docker` (puerto 5570, copia de `dev.db`, sin tokens; `/docs` debe dar 404).
- Antes de hacer push: `make check` (lo mismo que el job `check`).

## 7. Volver atrás

- **Código:** Railway → Deployments → el deploy anterior → **Redeploy**.
- **Base:** las migraciones solo avanzan. Si una falla, el job `db` corta el pipeline antes de desplegar; se corrige con una migración nueva.
- **Webhook:** si la API no responde, Telegram guarda los mensajes 24 h y los reintenta; `/v1/health` muestra los pendientes.
