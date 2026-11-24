# Export mapping — Hy-Tek Meet Manager (JET4)

Source reference: `E1T2CV2026.mdb` (Microsoft Access, Jet 4.0). Identified as a **full Meet Manager competition database**, not a Team Manager-only exchange file. NATIUM exports a meet database with `Meet`, `Event`, `Team`, `Athlete` and `Entry` populated from accepted registrations so the organizer can open or merge it in Meet Manager.

## Encoding rules (observed)

| Concept | Meet Manager field | Values in reference |
| --- | --- | --- |
| Stroke | `Event.Event_stroke` | `A` free, `B` back, `C` breast, `D` fly, `E` IM |
| Individual / relay | `Event.Ind_rel` | `I` / `R` |
| Event sex (label) | `Event.Event_sex` | `W`/`M`/`X`/`G`/`B` |
| Event gender | `Event.Event_gender` | `F` / `M` / `X` |
| Athlete sex | `Athlete.Ath_Sex` | `F` / `M` |
| Course (seed) | `Entry.ActSeed_course` / `ConvSeed_course` | `S` short meters (all 1016 entries in reference) |
| Meet course | `Meet.Meet_course` | `2` = SCM in this file |
| Seed time | `Entry.ActualSeed_time` / `ConvSeed_time` | IEEE single, **seconds** (e.g. `32.5` = 00:32.50). `0` = NT |
| Team abbr | `Team.Team_abbr` | Text(5) |
| Names | `Athlete.Last_name` / `First_name` | Text(20) each |
| Birth date | `Athlete.Birth_date` | DateTime |
| Event key | `Event.Event_ptr` ↔ `Entry.Event_ptr` | Long Integer |
| Athlete key | `Athlete.Ath_no` ↔ `Entry.Ath_no` | Long Integer |
| Team key | `Team.Team_no` ↔ `Athlete.Team_no` | Long Integer |

## NATIUM → Meet Manager

| NATIUM | Meet Manager |
| --- | --- |
| `competitions.name` | `Meet.Meet_name1` (max 45) |
| `competitions.venue` / city | `Meet.Meet_location` |
| `competitions.start_date` / `end_date` | `Meet.Meet_start` / `Meet_end` |
| `competitions.age_reference_date` | `Meet.Calc_date` |
| `competitions.pool_course` SCM/LCM | `Meet.Meet_course` 2/1; entry course `S`/`L` |
| `competition_events.event_number` | `Event.Event_no`; `Event_ptr` = 1000 + event_number |
| `event_catalog.distance_m` | `Event.Event_dist` |
| `event_catalog.stroke` | `Event.Event_stroke` via free→A … medley→E |
| `competition_events.sex` / athlete sex | `Event_gender` / `Ath_Sex` F\|M; `Event_sex` W\|M |
| `teams.name` / `short_name` / `code` | `Team_name` (30) / `Team_short` (16) / `Team_abbr` (5) |
| `athletes.last_name` / `first_name` | truncated to 20 chars |
| `athletes.birth_date` | `Birth_date` |
| age at `age_reference_date` | `Ath_age` |
| `registration_entries.entry_time_cs` | `ActualSeed_time = cs / 100.0` |
| `registration_entries.no_time` | seed time `0` |
| sequential export ids | `Team_no`, `Ath_no`, `Comp_no` |

Relays are out of scope for Stage 1 (NATIUM entries are individual).

## Generator

`tools/mdb-exporter` (Jackcess) copies the sanitized template `mm-template.mdb`, writes `Meet` / `Event` / `Team` / `Athlete` / `Entry`, and emits a JET4 `.mdb`. Round-trip verification uses `mdbtools` (`mdb-ver`, `mdb-export`).
