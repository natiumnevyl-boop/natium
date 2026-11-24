# Aceptación Meet Manager — archivo de prueba NATIUM

## Archivo

`docs/fixtures/NATIUM_MEET_MANAGER_TEST.mdb` (JET4)

Generado con Jackcess a partir del adaptador `tools/mdb-exporter`, **sin** datos personales reales.

## Contenido esperado

| Tabla | Filas | Notas |
| --- | --- | --- |
| Meet | 1 | Nombre `NATIUM Prueba Export MDB` |
| Team | 2 | `CLUBA`, `CLUBB` |
| Athlete | 16 | 8 por equipo; nombres con acentos |
| Event | 4 | 50 libre F/M, 100 dorso F, 50 mariposa M |
| Entry | 32 | 2 pruebas por atleta; tiempos en **segundos** |

Tiempos de muestra (segundos Hy-Tek = centésimas NATIUM / 100):

- Sofía Álvarez · 50 libre · `32.50`
- José García · 50 libre · `28.75`
- María Pérez · 100 dorso · `78.20`

Curso de inscripción: `S` (SCM).

## Cómo importar / abrir

El archivo de referencia `E1T2CV2026.mdb` es una **base completa de competencia** Meet Manager, no un export parcial de Team Manager.

Para la prueba de aceptación:

1. Cierra Meet Manager si tiene abierta otra base.
2. En Meet Manager usa **File → Open** (o el equivalente en tu versión) y selecciona `NATIUM_MEET_MANAGER_TEST.mdb`.
3. Comprueba Meet / Teams / Athletes / Events / Entries.
4. Si tu flujo habitual es **Import Entries** hacia una competencia ya creada, no asumas equivalencia: primero valida abriendo esta base; después documenta si tu versión ofrece importación desde otra base MM.

## Criterio de éxito

- Meet Manager abre el archivo sin error de formato.
- Se ven 2 equipos, 16 atletas y las 32 entradas.
- Los tiempos coinciden con la tabla anterior (±0.01 s por precisión `Single`).

La compatibilidad definitiva solo se declara tras este paso en el programa real del organizador.
