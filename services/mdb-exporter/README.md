# MDB exporter service (optional)

Vercel cannot run Jackcess/Java. Deploy this container only when you need **Descargar archivo MDB** in production.

## Build

From the repository root (requires JDK 21 + Maven):

```bash
export JAVA_HOME=…
mvn -f tools/mdb-exporter/pom.xml -q package
docker build -f services/mdb-exporter/Dockerfile -t natium-mdb-exporter .
```

## Run

```bash
docker run --rm -p 8088:8088 -e MDB_EXPORTER_TOKEN='long-random-token' natium-mdb-exporter
```

Set in the Vercel project (and rebuild):

- `VITE_MDB_EXPORTER_URL=https://your-host.example`
- Do **not** put the bearer token in `VITE_*`. The SPA obtains a short-lived export ticket from Supabase RPC and the browser posts the snapshot to the exporter only when that URL is configured; prefer routing generation through a future Edge proxy that attaches the token server-side.

Until the service is deployed, NATIUM still generates and downloads a **CSV operativo** and keeps MDB marked as pending configuration in the UI.
