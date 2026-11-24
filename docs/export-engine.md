# Export engine

## Status

| Format | Adapter | Production download |
| --- | --- | --- |
| CSV operativo | TypeScript in the SPA | **Available** (organizer, accepted registrations) |
| Hy-Tek Meet Manager `.mdb` (JET4) | Jackcess (`tools/mdb-exporter`) | **Blocked on deploying** the optional Java container + Edge Function secrets |

Reference analyzed: `E1T2CV2026.mdb` (full Meet Manager meet database). Mapping: [export-mapping.md](./export-mapping.md).

## Architecture

```
Organizer UI (Exportar inscripciones)
  → RPC prepare_export_job (RLS + validation + export_jobs row)
  → snapshot JSON (teams / athletes / events / entries)
  → adapter
       ├─ csv_generic  → Blob → Storage exports/ → complete_export_job → download
       └─ mdb_meet_manager → Edge Function generate-mdb → Jackcess HTTP service → Storage → download
```

- Extraction and permission checks live in Postgres (`get_competition_export_snapshot`, `prepare_export_job`).
- Normalized model: `src/features/exports/model.ts`.
- CSV adapter: `src/features/exports/adapters/csv.ts`.
- MDB mapping: `src/features/exports/mapping.ts` + `tools/mdb-exporter` (Jackcess).
- History: `export_jobs` / `export_job_items` with Spanish UI states.
- Storage bucket `exports` is private; organizers read/write only their competition folder; downloads use short-lived signed URLs.

## Deploying MDB generation

Vercel cannot run Java. Build and run the container from [services/mdb-exporter/README.md](../services/mdb-exporter/README.md), then set Edge Function secrets:

- `MDB_EXPORTER_URL`
- `MDB_EXPORTER_TOKEN`

Deploy `supabase/functions/generate-mdb`. Do not put the token in `VITE_*`.

## Local CLI

```bash
export JAVA_HOME=…
mvn -f tools/mdb-exporter/pom.xml -q package
java -jar tools/mdb-exporter/target/mdb-exporter-1.0.0.jar write --in payload.json --out out.mdb
mdb-ver out.mdb   # expect JET4
```

## Acceptance of MDB compatibility

Round-trip with `mdbtools` proves the file is a valid Jet 4 Access database with the expected tables and seed times in **seconds**. Final acceptance still requires importing the file into the organizer’s Meet Manager installation.
