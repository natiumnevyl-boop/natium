# Export engine

## Status

| Format | Adapter | Production download |
| --- | --- | --- |
| CSV operativo | TypeScript in the SPA | Available |
| Hy-Tek Meet Manager `.mdb` (JET4) | Jackcess (`tools/mdb-exporter` + Render) | Requires Render service + Supabase secrets |

Reference analyzed: `E1T2CV2026.mdb`. Mapping: [export-mapping.md](./export-mapping.md). Acceptance sample: [mdb-acceptance.md](./mdb-acceptance.md).

## Architecture

```
Organizer UI (Exportar inscripciones)
  → RPC prepare_export_job (validates, freezes snapshot on export_jobs)
  → CSV: client builds file → Storage → complete_export_job
  → MDB: Edge Function generate-mdb
        → claim_export_job
        → wake Render /health (cold start)
        → Jackcess POST /v1/generate-mdb (Bearer token)
        → Storage exports/ (service role)
        → complete_export_job
  → UI polls export_jobs until completed | failed (no browser-only workers)
```

Cold starts on Render Free are handled with retries and a durable job row. No keep-alive pings.

## Deploy MDB generator

See [services/mdb-exporter/README.md](../services/mdb-exporter/README.md) and root `render.yaml`.
