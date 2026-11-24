# natium-mdb-exporter

Microservicio Jackcess (JET4) para generar archivos Meet Manager. Vercel no ejecuta Java; este contenedor sí.

## Despliegue en Render (plan Free)

1. En [Render](https://dashboard.render.com) → **New** → **Blueprint**.
2. Conecta el repo `natiumnevyl-boop/natium` y usa `render.yaml` (servicio `natium-mdb-exporter`).
3. En Environment añade `MDB_EXPORTER_TOKEN` (token ≥ 256 bits, solo en el panel).
4. Espera el deploy y copia la URL pública, por ejemplo `https://natium-mdb-exporter.onrender.com`.
5. Comprueba `GET /health` → `{"status":"ok"}`.

### Secretos en Supabase (Edge Function `generate-mdb`)

```bash
supabase secrets set \
  MDB_EXPORTER_URL='https://TU-SERVICIO.onrender.com' \
  MDB_EXPORTER_TOKEN='EL_MISMO_TOKEN' \
  --project-ref ecfglnjybxyubzvfxgqu
supabase functions deploy generate-mdb --project-ref ecfglnjybxyubzvfxgqu
```

Nunca uses prefijo `VITE_` ni subas el token a GitHub.

## Arranque en frío

Render Free suspende el contenedor. NATIUM no hace pings artificiales: la Edge Function despierta `/health`, reintenta la generación y el trabajo queda persistido en `export_jobs` para reanudar sin duplicar.

## Local

```bash
mvn -f tools/mdb-exporter/pom.xml -q package
MDB_EXPORTER_TOKEN='dev-only-token' java -jar tools/mdb-exporter/target/mdb-exporter-1.0.0.jar serve --port 8088
docker build -f services/mdb-exporter/Dockerfile -t natium-mdb-exporter .
```
