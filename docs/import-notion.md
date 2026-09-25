# Importar Notion (P14)

Trae las 9 bases de "Seguimiento financiero" (tarjetas, costos fijos, plataformas, cuentas, relación de gastos y resumen) a Kogane. Por defecto lee `../docs/files/migrations/notion/Seguimiento financiero`; con otro export, agrega `DIR=<carpeta>`. "Pago de Prestamos" y "Pago de Terreno" van en P27.

**Desde la web:** Registrar ▸ Reconocimiento / Importación ▸ "Notion (ZIP o CSV)": sube el ZIP que exporta Notion, revisa la previsualización por pestañas y recién ahí **Importar** (o **Descartar**). Es el mismo proceso que el comando.

**Desde la terminal**, todo se corre desde `kogane-api`:

```bash
eval "$(fnm env)"; fnm use 22
```

## Producción (una sola vez)

Va después de P26 (D36) y con el código de P14 ya desplegado.

```bash
make db-deploy ENV=prod                  # 1. aplica las migraciones que falten en Turso
make import-notion ENV=prod              # 2. solo informe: debe decir "REMOTA (Turso)", 0 filas bloqueadas y 30 de 30 meses
make import-notion ENV=prod CONFIRM=yes  # 3. guarda
make import-notion ENV=prod              # 4. comprobación: todo "iguales: no se tocan"
```

## Desarrollo

```bash
make import-notion                       # solo informe
make import-notion CONFIRM=yes           # guarda en dev.db
make import-notion-reset CONFIRM=yes     # borra solo lo importado, para empezar de cero
```

## Qué revisar en el informe

- **Filas bloqueadas (⛔):** no se importan hasta corregirlas (por ejemplo, un nombre que no está en el catálogo: agrégalo en el seed y corre `make seed`).
- **Avisos (⚠️):** se importan igual. Filas vacías o sin monto se omiten; las cuentas "Abonado" quedan pendientes (registra el abono en la web).
- **Por mes:** la columna "enlazadas" debe ser igual a "Notion" (✅) en todos los meses. Notion suma las filas enlazadas a cada página del Resumen, no el mes de pago.
- **Gastos y deudas:** cuántas son nuevas, cuántas cambiaron en Notion y cuántas están iguales (esas no se tocan, así que lo que editaste en Kogane se mantiene).

## Cómo queda registrado

- `imp_batches`: una fila por cada corrida con `CONFIRM=yes` (carpeta, nuevas, cambiadas, iguales).
- `imp_rows`: una fila por registro importado, con el CSV original (`raw`), el archivo y la línea, y el registro de Kogane que creó (`targetTable` + `targetId`, mismo `importKey`).

## Si algo sale mal

- **"Faltan N migraciones en esta base":** corre `make db-deploy` con el mismo `ENV`.
- **Deshacer:** `make import-notion-reset ENV=prod CONFIRM=yes` borra solo lo que vino de Notion (gastos, deudas y sus abonos, `imp_batches` e `imp_rows`). El sueldo por mes y los % de los grupos se quedan: la próxima importación los vuelve a escribir.
- Los gastos registrados por el bot no se cruzan con Notion: revisa a mano el mes en curso.
