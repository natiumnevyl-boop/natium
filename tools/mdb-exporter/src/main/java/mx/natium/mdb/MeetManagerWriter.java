package mx.natium.mdb;

import com.healthmarketscience.jackcess.Database;
import com.healthmarketscience.jackcess.DatabaseBuilder;
import com.healthmarketscience.jackcess.Row;
import com.healthmarketscience.jackcess.Table;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Writes a Hy-Tek Meet Manager JET4 database from a NATIUM export payload. */
public final class MeetManagerWriter {
  private MeetManagerWriter() {}

  public static void write(ExportPayload payload, Path output) throws IOException {
    Path staged = Files.createTempFile("natium-mm-stage-", ".mdb");
    try {
      try (InputStream in = MeetManagerWriter.class.getResourceAsStream("/mm-template.mdb")) {
        if (in == null) throw new IOException("Missing classpath resource /mm-template.mdb");
        Files.copy(in, staged, StandardCopyOption.REPLACE_EXISTING);
      }

      Map<Long, Long> teamNoByLogical = new HashMap<>();
      Map<Long, Long> athNoByLogical = new HashMap<>();
      Map<Long, Long> eventPtrByLogical = new HashMap<>();

      try (Database db = DatabaseBuilder.open(staged.toFile())) {
        clearTable(db, "Entry");
        clearTable(db, "Athlete");
        clearTable(db, "Team");
        clearTable(db, "Event");
        clearTable(db, "Sessitem");

        writeMeet(db, payload.competition);
        writeEvents(db, payload.events, eventPtrByLogical);
        writeTeams(db, payload.teams, teamNoByLogical);
        writeAthletes(db, payload.athletes, teamNoByLogical, athNoByLogical);
        writeEntries(db, payload.entries, eventPtrByLogical, athNoByLogical);
        db.flush();
      }

      Files.createDirectories(output.getParent() == null ? Path.of(".") : output.getParent());
      Files.move(staged, output, StandardCopyOption.REPLACE_EXISTING);
    } finally {
      Files.deleteIfExists(staged);
    }
  }

  private static void clearTable(Database db, String name) throws IOException {
    Table table = db.getTable(name);
    if (table == null) return;
    List<Row> rows = new ArrayList<>();
    for (Row row : table) rows.add(row);
    for (Row row : rows) table.deleteRow(row);
  }

  private static void writeMeet(Database db, ExportPayload.Competition competition)
      throws IOException {
    if (competition == null) return;
    Table meet = db.getTable("Meet");
    if (meet == null) return;
    boolean updated = false;
    for (Row row : meet) {
      row.put("Meet_name1", truncate(competition.name, 45));
      row.put("Meet_location", truncate(firstNonBlank(competition.venue, competition.city), 45));
      row.put("Meet_start", toDate(competition.startDate));
      row.put("Meet_end", toDate(firstNonBlank(competition.endDate, competition.startDate)));
      row.put(
          "Calc_date", toDate(firstNonBlank(competition.ageReferenceDate, competition.startDate)));
      row.put("Meet_course", courseCode(competition.poolCourse));
      row.put("Enter_ages", true);
      row.put("Enter_birthdate", true);
      row.put("Lastname_first", true);
      meet.updateRow(row);
      updated = true;
    }
    if (!updated) throw new IOException("Meet template has no Meet row to update");
  }

  private static void writeEvents(
      Database db, List<ExportPayload.Event> events, Map<Long, Long> eventPtrByLogical)
      throws IOException {
    Table table = db.getTable("Event");
    if (table == null) throw new IOException("Event table missing");
    for (ExportPayload.Event event : events) {
      Map<String, Object> row = new HashMap<>();
      row.put("Event_no", event.eventNo);
      row.put("Event_ltr", " ");
      row.put("Ind_rel", "I");
      String gender = normalizeSex(event.sex);
      row.put("Event_sex", "F".equals(gender) ? "W" : "M".equals(gender) ? "M" : "X");
      row.put("Event_gender", gender.isEmpty() ? "X" : gender);
      row.put("Event_dist", (float) event.distanceM);
      row.put("Event_stroke", strokeCode(event.stroke));
      row.put("Low_age", event.lowAge == null ? 0 : event.lowAge);
      row.put("High_Age", event.highAge == null ? 109 : event.highAge);
      row.put("Multi_age", Boolean.TRUE);
      row.put("Event_stat", "1");
      row.put("Event_rounds", 1);
      row.put("Num_prelanes", 8);
      row.put("Num_finlanes", 8);
      row.put("Heats_infinal", "A");
      row.put("Heats_insemi", 0);
      row.put("Std_lanes", "A");
      row.put("Auto_seed", Boolean.TRUE);
      row.put("Twoperlane_req", Boolean.FALSE);
      row.put("Preheat_order", "A");
      row.put("Finheat_order", "A");
      row.put("Score_event", Boolean.TRUE);
      row.put("Event_note", truncate(nullToEmpty(event.note), 20));
      Map<String, Object> written = table.addRowFromMap(row);
      eventPtrByLogical.put(event.eventPtr, ((Number) written.get("Event_ptr")).longValue());
    }
  }

  private static void writeTeams(
      Database db, List<ExportPayload.Team> teams, Map<Long, Long> teamNoByLogical)
      throws IOException {
    Table table = db.getTable("Team");
    if (table == null) throw new IOException("Team table missing");
    for (ExportPayload.Team team : teams) {
      Map<String, Object> row = new HashMap<>();
      row.put("Team_name", truncate(team.name, 30));
      row.put("Team_short", truncate(firstNonBlank(team.shortName, team.abbr), 16));
      row.put(
          "Team_abbr",
          truncate(firstNonBlank(team.abbr, team.code, "TEAM"), 5).toUpperCase(Locale.ROOT));
      row.put("Team_stat", " ");
      row.put("Team_lsc", "  ");
      row.put("Team_NoPoints", Boolean.FALSE);
      row.put("Team_Selected", Boolean.FALSE);
      row.put("NoTeam_surcharge", Boolean.FALSE);
      row.put("NoFacility_surcharge", Boolean.FALSE);
      row.put("NoAthlete_surcharge", Boolean.FALSE);
      row.put("NoRelayOnly_surcharge", Boolean.FALSE);
      row.put("Team_Gender", "X");
      row.put("Team_Code", truncate(nullToEmpty(team.code), 30));
      Map<String, Object> written = table.addRowFromMap(row);
      teamNoByLogical.put(team.teamNo, ((Number) written.get("Team_no")).longValue());
    }
  }

  private static void writeAthletes(
      Database db,
      List<ExportPayload.Athlete> athletes,
      Map<Long, Long> teamNoByLogical,
      Map<Long, Long> athNoByLogical)
      throws IOException {
    Table table = db.getTable("Athlete");
    if (table == null) throw new IOException("Athlete table missing");
    for (ExportPayload.Athlete athlete : athletes) {
      Long teamNo = teamNoByLogical.get(athlete.teamNo);
      if (teamNo == null) {
        throw new IOException("Athlete references unknown teamNo " + athlete.teamNo);
      }
      Map<String, Object> row = new HashMap<>();
      row.put("Last_name", truncate(athlete.lastName, 20));
      row.put("First_name", truncate(athlete.firstName, 20));
      row.put("Initial", " ");
      row.put("Ath_Sex", normalizeSex(athlete.sex));
      row.put("Birth_date", toDate(athlete.birthDate));
      row.put("Team_no", teamNo);
      row.put("Schl_yr", "  ");
      row.put("Ath_age", athlete.age == null ? 0 : athlete.age);
      row.put("Reg_no", " ");
      row.put("Ath_stat", " ");
      row.put("Comp_no", athlete.compNo);
      row.put("Pref_name", " ");
      row.put("Masters_RegVerified", Boolean.FALSE);
      row.put("PC_Hide", Boolean.FALSE);
      Map<String, Object> written = table.addRowFromMap(row);
      athNoByLogical.put(athlete.athNo, ((Number) written.get("Ath_no")).longValue());
    }
  }

  private static void writeEntries(
      Database db,
      List<ExportPayload.Entry> entries,
      Map<Long, Long> eventPtrByLogical,
      Map<Long, Long> athNoByLogical)
      throws IOException {
    Table table = db.getTable("Entry");
    if (table == null) throw new IOException("Entry table missing");
    for (ExportPayload.Entry entry : entries) {
      Long eventPtr = eventPtrByLogical.get(entry.eventPtr);
      Long athNo = athNoByLogical.get(entry.athNo);
      if (eventPtr == null) throw new IOException("Entry references unknown eventPtr " + entry.eventPtr);
      if (athNo == null) throw new IOException("Entry references unknown athNo " + entry.athNo);
      float seed =
          entry.noTime || entry.seedTimeSeconds == null ? 0f : entry.seedTimeSeconds.floatValue();
      String course = firstNonBlank(entry.course, "S");
      Map<String, Object> row = new HashMap<>();
      row.put("Event_ptr", eventPtr);
      row.put("Ath_no", athNo);
      row.put("ActSeed_course", course);
      row.put("ActualSeed_time", seed);
      row.put("ConvSeed_course", course);
      row.put("ConvSeed_time", seed);
      row.put("Scr_stat", Boolean.FALSE);
      row.put("Spec_stat", " ");
      row.put("Alt_stat", Boolean.FALSE);
      row.put("Bonus_event", Boolean.FALSE);
      row.put("Ev_score", 0f);
      row.put("JDEv_score", 0f);
      row.put("Pre_heat", 0);
      row.put("Pre_lane", 0);
      row.put("Pre_stat", " ");
      row.put("Pre_Time", 0f);
      row.put("Pre_course", " ");
      row.put("early_seed", Boolean.FALSE);
      row.put("super_prefinalist", Boolean.FALSE);
      row.put("super_finfinalist", Boolean.FALSE);
      row.put("pre_contacted", Boolean.FALSE);
      row.put("P_early_seed", Boolean.FALSE);
      table.addRowFromMap(row);
    }
  }

  static String strokeCode(String stroke) {
    if (stroke == null) return "A";
    return switch (stroke.toLowerCase(Locale.ROOT)) {
      case "free", "a" -> "A";
      case "back", "b" -> "B";
      case "breast", "c" -> "C";
      case "fly", "d" -> "D";
      case "medley", "im", "e" -> "E";
      default -> "A";
    };
  }

  static int courseCode(String poolCourse) {
    if (poolCourse == null) return 2;
    return switch (poolCourse.toUpperCase(Locale.ROOT)) {
      case "LCM" -> 1;
      case "SCM" -> 2;
      default -> 2;
    };
  }

  private static String normalizeSex(String sex) {
    if (sex == null) return "";
    String s = sex.trim().toUpperCase(Locale.ROOT);
    if (s.startsWith("F") || s.equals("W")) return "F";
    if (s.startsWith("M") || s.equals("B")) return "M";
    return s.isEmpty() ? "" : "X";
  }

  private static Date toDate(String isoDate) {
    if (isoDate == null || isoDate.isBlank()) return null;
    LocalDate d = LocalDate.parse(isoDate.substring(0, Math.min(10, isoDate.length())));
    return Date.from(d.atStartOfDay(ZoneId.of("UTC")).toInstant());
  }

  private static String truncate(String value, int max) {
    if (value == null) return "";
    String trimmed = value.trim();
    return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
  }

  private static String nullToEmpty(String value) {
    return value == null ? "" : value;
  }

  private static String firstNonBlank(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) return value.trim();
    }
    return "";
  }
}
