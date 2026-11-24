package mx.natium.mdb;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.ArrayList;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ExportPayload {
  public Competition competition;
  public List<Team> teams = new ArrayList<>();
  public List<Athlete> athletes = new ArrayList<>();
  public List<Event> events = new ArrayList<>();
  public List<Entry> entries = new ArrayList<>();

  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class Competition {
    public String name;
    public String venue;
    public String city;
    public String startDate;
    public String endDate;
    public String ageReferenceDate;
    public String poolCourse;
    public Integer poolLengthM;
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class Team {
    public long teamNo;
    public String name;
    public String shortName;
    public String abbr;
    public String code;
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class Athlete {
    public long athNo;
    public long teamNo;
    public int compNo;
    public String firstName;
    public String lastName;
    public String sex;
    public String birthDate;
    public Integer age;
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class Event {
    public int eventNo;
    public long eventPtr;
    public String sex;
    public int distanceM;
    public String stroke;
    public Integer lowAge;
    public Integer highAge;
    public String note;
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class Entry {
    public long eventPtr;
    public long athNo;
    public Double seedTimeSeconds;
    public String course;
    public boolean noTime;
  }
}
