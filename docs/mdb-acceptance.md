# Aceptación Meet Manager — archivo de prueba NATIUM

## Archivos

| Archivo | Origen | Formato |
| --- | --- | --- |
| `docs/fixtures/NATIUM_MEET_MANAGER_TEST.mdb` | Fixture local Jackcess (datos sintéticos) | JET4 |
| `docs/fixtures/NATIUM_MEET_MANAGER_ACCEPTANCE.mdb` | **Descarga real desde producción** (pipeline Edge Function → Render → Storage signed URL) | JET4 |

Copia local de la descarga de aceptación: `/tmp/NATIUM_MEET_MANAGER_ACCEPTANCE.mdb` (mismo contenido).

Sin datos personales reales: competencia QA sintética `Copa MDB QA` / código `MDB26`.

## Contenido esperado (aceptación producción)

| Tabla | Filas | Notas |
| --- | --- | --- |
| Meet | 1 | `Meet_name1=Copa MDB QA`, sede `Alberca QA`, curso SCM (`Meet_course=2`) |
| Team | 2 | Club Águilas MDB (`AGU`), Club Delfines MDB (`DEL`) |
| Athlete | 32 | 16 por equipo; nombres con acentos (p. ej. Sofía Álvarez) |
| Event | 4 | 50 libre F/M (`A`), 100 dorso F (`B`), 50 mariposa M (`D`) |
| Entry | 64 | 2 pruebas por atleta; tiempos en **segundos** Hy-Tek |

Tiempos de muestra (segundos = centésimas NATIUM / 100):

- Sofía Álvarez · 50 libre · `32.50`
- Curso de inscripción: `S` (SCM)

SHA-256 (aceptación): `000bf51af9bc98217be291c98bf8f67c75c06e44e2953106dd81eb52fff3f601`  
Tamaño: `4 063 232` bytes · nombre de job: `MDB26-inscripciones-2026-11-24.mdb`

## Cómo importar / abrir

El archivo de referencia `E1T2CV2026.mdb` es una **base completa de competencia** Meet Manager, no un export parcial de Team Manager.

Para la prueba definitiva:

1. Cierra Meet Manager si tiene abierta otra base.
2. **File → Open** y selecciona `docs/fixtures/NATIUM_MEET_MANAGER_ACCEPTANCE.mdb` (o la copia en `/tmp`).
3. Comprueba Meet / Teams / Athletes / Events / Entries contra la tabla anterior.
4. Si tu flujo habitual es **Import Entries** hacia una competencia ya creada, no asumas equivalencia: primero valida abriendo esta base; después documenta si tu versión ofrece importación desde otra base MM.

## Criterio de éxito

- Meet Manager abre el archivo sin error de formato JET4.
- Se ven 2 equipos, 32 atletas y 64 entradas.
- Los tiempos coinciden (±0.01 s por precisión `Single`).

La compatibilidad definitiva con Meet Manager **solo** se declara tras este paso en el programa real del organizador.

## Evidencia de pipeline (producción, 2026-11-24)

- Exporter: `https://natium-mdb-exporter.onrender.com/health` → `200 {"status":"ok"}`
- Secretos Edge Function: `MDB_EXPORTER_URL`, `MDB_EXPORTER_TOKEN` presentes
- Auth exporter `/v1/generate-mdb` sin token / token inválido → `401`
- `prepare_export_job` + `generate-mdb` → job `completed`, snapshot limpiado, `file_path` en Storage
- Inscripciones de la competencia → estado `exported`
- Coach: `prepare_export_job` bloqueado; listado `export_jobs` vacío; firma Storage denegada
- Historial: 2 jobs `completed` visibles al organizador (re-export tras wake)
- Arranque en frío (Render Free, ~18 min idle): `/health` → `200` en **13 579 ms**; generación posterior OK en ~6 s
