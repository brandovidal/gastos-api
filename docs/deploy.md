# Despliegue y configuración de kogane-api

kogane-api corre en **Railway**, usa **Turso** (`kogane-db`) como base y el bot de Telegram le manda los mensajes por webhook. Producción: **`https://kogane-api.up.railway.app`**. Railway está conectado al repo y despliega solo cada push a `main`. GitHub Actions (`.github/workflows/deploy.yml`) hace lo que Railway no hace:

```
check (lint, build, tests) → db (migraciones + seed en kogane-db) → telegram (webhook + menú)
```

Con **"Wait for CI"** activado en Railway (Settings → Source), Railway espera a que ese workflow pase antes de desplegar.

Las migraciones corren **antes** que el código nuevo: tienen que funcionar también con la versión anterior (primero agregar, borrar en un deploy posterior).

## Entornos

| Entorno     | Archivo o lugar                                                     | Base                    | Para qué                                                                 |
| ----------- | ------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------ |
| local (dev) | `.env.dev`                                                          | SQLite `file:./dev.db`  | `pnpm dev` (o `make dev`), `make deps`, `make tunnel` para probar el bot |
| producción  | Railway (variables) · GitHub (secretos) · `.env.prod` en tu máquina | Turso `kogane-db`       | La API real; `make <tarea> ENV=prod` para operar a mano                  |
| tests       | `.env.test`                                                         | SQLite `file:./test.db` | `make check` y el CI                                                     |

Los `.env*` no se suben al repo (salvo `.env.example`). Nunca pegues tokens en chats ni issues.

## `PUBLIC_URL` por entorno

Es la URL pública (HTTPS) donde Telegram manda el webhook: `PUBLIC_URL` + `/v1/telegram/webhook`.

| Entorno                                       | Valor                               | Nota                                                                                                 |
| --------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **producción** (Railway, GitHub, `.env.prod`) | `https://kogane-api.up.railway.app` | El dominio que genera Railway. **No** `kogane-api.railway.internal` (red privada): Telegram no llega |
| **local** (`.env.dev`)                        | `http://localhost:5560` o vacío     | Telegram exige HTTPS público: la URL la pone `make tunnel` (cloudflared, cambia en cada arranque)    |
| **tests** (`.env.test`)                       | vacío                               | Los tests no registran webhooks                                                                      |

`make tunnel` abre el túnel, apunta el webhook del bot de `.env.dev` al túnel y, con Ctrl+C, lo **devuelve a producción** (`PUBLIC_URL` de `.env.prod`). Si local y producción usan el mismo bot, mientras el túnel está abierto el bot de producción no recibe mensajes. Para evitarlo, crea un segundo bot en @BotFather y pon su token en `.env.dev`.

Secretos (`API_KEY`, `TELEGRAM_WEBHOOK_SECRET`): `make secret` (o `openssl rand -hex 32`); uno distinto por entorno.

## Tareas (`make help`)

El `Makefile` define las variables comunes (`ENV`, archivo `.env.<ENV>`) e incluye un archivo por grupo en `makefiles/`:

| Archivo                | Tareas                                                         | Uso en el despliegue                                                                              |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `makefiles/app.mk`     | `dev`, `debug`, `clean`                                        | `pnpm dev` equivale a `make dev` (local)                                                          |
| `makefiles/db.mk`      | `deps`, `generate`, `db-deploy`, `migrate`, `seed`, `studio`   | `make deps ENV=prod` / `make db-deploy ENV=prod` hacen a mano lo que el job `db`                  |
| `makefiles/bot.mk`     | `telegram`, `tunnel`, `secret`                                 | `make telegram ENV=prod` hace a mano lo que el job `telegram`; `make tunnel` para el bot en local |
| `makefiles/quality.mk` | `lint`, `format`, `build`, `test`, `test-integration`, `check` | `make check` es lo mismo que el job `check`                                                       |
| `makefiles/eval.mk`    | `eval-replay`, `eval-ai`                                       | no entra al despliegue; `eval-ai` gasta cuota y pide `CONFIRM=yes`                                |
| `makefiles/docker.mk`  | `docker`                                                       | prueba local de la imagen de Railway                                                              |

`package.json` solo tiene `pnpm dev` y lo que llaman Railway (`build`, `start:prod`), el CI (`test:ci`, `test:integration`) y husky (`lint`, `format`).

## 1. Turso

1. La base de producción es `kogane-db`. Si hay que crearla: `turso db create kogane-db`.
2. URL: `turso db show kogane-db --url` → `DATABASE_URL`.
3. Token: `turso db tokens create kogane-db` → `DATABASE_AUTH_TOKEN`. Para **rotarlo** (el anterior se pegó en un chat): `turso db tokens invalidate kogane-db` y crear uno nuevo; actualizarlo en Railway, en GitHub y en `.env.prod`.

## 2. Railway

1. Proyecto `kogane` con el servicio `kogane-api` conectado al repo `brandovidal/kogane-api`, rama `main`, con **Auto deploy** y **Wait for CI** activados (Settings → Source).
2. **Settings → Networking → Generate Domain**: la URL pública es `PUBLIC_URL` (hoy `https://kogane-api.up.railway.app`). **No** uses `kogane-api.railway.internal`: es la red privada de Railway y ni Telegram ni Cloudflare llegan a ella.
3. **Variables** del servicio (las lee la app en runtime):

| Variable                                                                 | Valor                                                                        |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `NODE_ENV`                                                               | `production` (apaga Swagger `/docs` y deja los logs en JSON)                 |
| `API_KEY`                                                                | una nueva: `make secret` (la usa kogane-app en `x-api-key`)                  |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN`                                    | de Turso                                                                     |
| `GROQ_API_KEY`, `GEMINI_API_KEY`                                         | claves de AI (capas gratuitas)                                               |
| `AI_TEXT_PRIMARY`                                                        | `groq` (por defecto) o `gemini`                                              |
| `TELEGRAM_BOT_TOKEN`                                                     | de @BotFather                                                                |
| `TELEGRAM_WEBHOOK_SECRET`                                                | uno nuevo: `make secret`                                                     |
| `TELEGRAM_ALLOWED_CHAT_IDS`                                              | tu `chat_id`                                                                 |
| `PUBLIC_URL`                                                             | la URL del paso 2                                                            |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2 (capturas y notas de voz, D54); ver la sección 4b              |
| `STORAGE_ENV`                                                            | `prod`: carpeta de producción en el bucket (D58). Sin ella la API no arranca |

`PORT` lo pone Railway. El resto de variables de `.env.example` tienen valores por defecto. Pega los valores **sin comillas**.

`railway.json` define el build con el `Dockerfile` y el health check `/v1/health`. Plan Hobby: 5 USD/mes con 5 USD de uso incluido.

## 3. GitHub

**Settings → Environments → `production`** (se crea sola en el primer deploy si no existe) con estos **secretos**:

| Secreto                                         | Lo usa el job                                    |
| ----------------------------------------------- | ------------------------------------------------ |
| `DATABASE_URL`, `DATABASE_AUTH_TOKEN`           | `db` (migraciones y seed)                        |
| `PUBLIC_URL`                                    | `telegram` (`https://kogane-api.up.railway.app`) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | `telegram` (webhook y menú)                      |

## 4. Telegram

- **Rotar el token** (el anterior se pegó en un chat): en @BotFather, `/revoke` → elegir el bot → token nuevo en Railway, GitHub y tus `.env`.
- El webhook y el menú de comandos los registra el job `telegram` en cada deploy. A mano: `make telegram ENV=prod URL=https://….up.railway.app`.
- Para probar el bot en local: `pnpm dev` en una terminal y `make tunnel` en otra; al cortar el túnel con Ctrl+C, el webhook vuelve a producción.

## 4b. Cloudflare R2 (capturas)

1. R2 → **Create bucket** `kogane` (privado; sin acceso público).
2. R2 → **Manage API tokens → Create API token** con permiso _Object Read & Write_ solo para ese bucket → `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY`; el **Account ID** → `R2_ACCOUNT_ID`.
3. Cargarlas en Railway con `STORAGE_ENV=prod`, y en tu `.env.dev` las mismas claves con `STORAGE_ENV=dev`. `dev` y `prod` siempre usan R2; sin las claves la API no arranca. Solo los tests (`STORAGE_ENV=test`) guardan en disco (`.data/storage-test`).
4. **Valor del token:** la app no lo usa (el Secret Access Key es su SHA-256). Sirve para `wrangler` y la API REST de Cloudflare; guárdalo en tu gestor de contraseñas.
5. **Reglas de ciclo de vida** (respaldo de la limpieza diaria de la API), una sola vez con `npx wrangler login`:

   ```sh
   npx wrangler r2 bucket lifecycle add kogane prod-drafts-expire prod/finance/drafts/ --expire-days 8
   npx wrangler r2 bucket lifecycle add kogane dev-drafts-expire dev/finance/drafts/ --expire-days 3
   ```

**Estructura del bucket (D58).** La base (`bot_files`) guarda solo la clave y los metadatos, nunca los bytes:

```
prod/finance/drafts/<yyyy-mm>/<id>.<ext>       borrador: se borra a los 7 días
prod/finance/expenses/<yyyy>/<mm>/<id>.<ext>   gasto guardado: se conserva
dev/finance/…                                   lo mismo para tu máquina
```

- Guardar un gasto copia el archivo a `expenses/` (CopyObject) y borra el de `drafts/`. La tarea diaria borra los `drafts/` vencidos y deja la fila como `deleted`.
- kogane-app ve la captura con una URL firmada de 10 minutos (R2 permite hasta 7 días; solo funciona con el endpoint S3, no con un dominio propio).
- Cada base limpia solo lo suyo: `dev.db` conoce claves `dev/` y Turso claves `prod/`. El token alcanza todo el bucket (R2 no limita por carpeta), así que la clave de `.env.dev` también podría tocar `prod/`: no la compartas.

Plan gratis: 10 GB, 1 M escrituras y 10 M lecturas al mes, sin cobro de salida.

## 5. Primer deploy

1. Cargar las variables (Railway) y los secretos (GitHub).
2. GitHub → **Actions → Deploy → Run workflow** (o push a `main`).
3. Revisar que pasen los 3 jobs; Railway despliega cuando terminan (Wait for CI).

## 6. Verificación

- `curl https://…/v1/health` → `database: OK` y `telegram.webhook: OK`.
- `https://…/docs` → **404** (Swagger apagado en producción).
- Desde Telegram: un texto, una foto de Yape y una nota de voz se guardan; `/uso` muestra la cuota del día.
- Imagen local igual a la de Railway: `make docker` (puerto 5570, copia de `dev.db`, sin tokens; `/docs` debe dar 404).
- Antes de hacer push: `make check` (lo mismo que el job `check`).

## 6b. Si Railway responde 502 "Application failed to respond"

La app no arrancó. Railway → Deployments → el último → **Deploy Logs**:

- `DATABASE_URL is not set` o `DATABASE_AUTH_TOKEN is not set for Turso`: falta la variable (o se pegó con comillas).
- `URL_INVALID`: la URL de Turso tiene comillas o espacios.
- Ningún error y el health check falla: revisar que el servicio use el `Dockerfile` (`railway.json`) y que `PORT` no esté fijado a mano.

## 7. Volver atrás

- **Código:** Railway → Deployments → el deploy anterior → **Redeploy**.
- **Base:** las migraciones solo avanzan. Si una falla, el job `db` corta el pipeline antes de desplegar; se corrige con una migración nueva.
- **Webhook:** si la API no responde, Telegram guarda los mensajes 24 h y los reintenta; `/v1/health` muestra los pendientes.
