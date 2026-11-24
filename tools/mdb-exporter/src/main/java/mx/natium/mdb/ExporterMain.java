package mx.natium.mdb;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * CLI and HTTP server for Meet Manager MDB generation.
 *
 * <pre>
 *   java -jar mdb-exporter.jar write --in payload.json --out meet.mdb
 *   java -jar mdb-exporter.jar serve
 * </pre>
 *
 * Environment:
 *   PORT                 listen port (default 8088)
 *   MDB_EXPORTER_TOKEN   required bearer token
 *   MDB_MAX_BODY_BYTES   max JSON body (default 2_000_000)
 *   MDB_MAX_CONCURRENT   in-flight generations (default 2)
 */
public final class ExporterMain {
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final AtomicInteger IN_FLIGHT = new AtomicInteger();

  public static void main(String[] args) throws Exception {
    if (args.length == 0) {
      printUsage();
      System.exit(2);
    }
    switch (args[0]) {
      case "write" -> writeCommand(args);
      case "serve" -> serveCommand(args);
      default -> {
        printUsage();
        System.exit(2);
      }
    }
  }

  private static void writeCommand(String[] args) throws Exception {
    Path in = null;
    Path out = null;
    for (int i = 1; i < args.length; i++) {
      switch (args[i]) {
        case "--in" -> in = Path.of(args[++i]);
        case "--out" -> out = Path.of(args[++i]);
        default -> throw new IllegalArgumentException("Unknown argument: " + args[i]);
      }
    }
    if (in == null || out == null) {
      throw new IllegalArgumentException("--in and --out are required");
    }
    ExportPayload payload = MAPPER.readValue(Files.readString(in), ExportPayload.class);
    validatePayload(payload);
    MeetManagerWriter.write(payload, out);
    System.out.println("Wrote " + out.toAbsolutePath());
  }

  private static void serveCommand(String[] args) throws Exception {
    int port = parsePort(System.getenv("PORT"), 8088);
    String token = System.getenv().getOrDefault("MDB_EXPORTER_TOKEN", "");
    int maxBody = parsePositive(System.getenv("MDB_MAX_BODY_BYTES"), 2_000_000);
    int maxConcurrent = parsePositive(System.getenv("MDB_MAX_CONCURRENT"), 2);

    for (int i = 1; i < args.length; i++) {
      switch (args[i]) {
        case "--port" -> port = Integer.parseInt(args[++i]);
        case "--token" -> token = args[++i];
        default -> throw new IllegalArgumentException("Unknown argument: " + args[i]);
      }
    }
    if (token.isBlank() || token.equals("changeme")) {
      throw new IllegalStateException("Set a strong MDB_EXPORTER_TOKEN before serving");
    }

    String expectedToken = token;
    Semaphore slots = new Semaphore(maxConcurrent);
    ExecutorService pool = Executors.newFixedThreadPool(Math.max(4, maxConcurrent + 2));

    HttpServer server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
    server.createContext("/health", exchange -> handleHealth(exchange));
    server.createContext(
        "/v1/generate-mdb",
        exchange -> handleGenerate(exchange, expectedToken, maxBody, slots));
    server.setExecutor(pool);
    server.start();
    System.out.println("MDB exporter listening on 0.0.0.0:" + port);
  }

  private static void handleHealth(HttpExchange exchange) throws IOException {
    addPublicCors(exchange);
    if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
      exchange.sendResponseHeaders(204, -1);
      exchange.close();
      return;
    }
    if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())
        && !"HEAD".equalsIgnoreCase(exchange.getRequestMethod())) {
      sendJson(exchange, 405, "{\"error\":\"method_not_allowed\"}");
      return;
    }
    sendJson(exchange, 200, "{\"status\":\"ok\"}");
  }

  /** CORS only for public health checks (not for authenticated generate). */
  private static void addPublicCors(HttpExchange exchange) {
    Headers headers = exchange.getResponseHeaders();
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  private static void handleGenerate(
      HttpExchange exchange, String expectedToken, int maxBody, Semaphore slots)
      throws IOException {
    Path out = null;
    boolean acquired = false;
    try {
      if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
        sendJson(exchange, 405, "{\"error\":\"method_not_allowed\"}");
        return;
      }
      String auth = exchange.getRequestHeaders().getFirst("Authorization");
      if (!bearerMatches(auth, expectedToken)) {
        sendJson(exchange, 401, "{\"error\":\"unauthorized\"}");
        return;
      }

      acquired = slots.tryAcquire(0, TimeUnit.SECONDS);
      if (!acquired) {
        sendJson(exchange, 429, "{\"error\":\"too_many_requests\"}");
        return;
      }
      IN_FLIGHT.incrementAndGet();

      byte[] requestBody = readBodyLimited(exchange.getRequestBody(), maxBody);
      ExportPayload payload = MAPPER.readValue(requestBody, ExportPayload.class);
      validatePayload(payload);

      out = Files.createTempFile("natium-export-", ".mdb");
      MeetManagerWriter.write(payload, out);
      long size = Files.size(out);
      if (size < 1024) {
        sendJson(exchange, 500, "{\"error\":\"empty_or_invalid_mdb\"}");
        return;
      }
      byte[] file = Files.readAllBytes(out);
      Headers headers = exchange.getResponseHeaders();
      headers.add("Content-Type", "application/vnd.ms-access");
      headers.add("Content-Disposition", "attachment; filename=\"inscripciones.mdb\"");
      headers.add("X-Natium-Bytes", Long.toString(size));
      exchange.sendResponseHeaders(200, file.length);
      try (OutputStream os = exchange.getResponseBody()) {
        os.write(file);
      }
      System.out.println(
          "mdb_generated bytes=" + size + " in_flight=" + IN_FLIGHT.get());
    } catch (BodyTooLargeException e) {
      sendJson(exchange, 413, "{\"error\":\"payload_too_large\"}");
    } catch (IllegalArgumentException e) {
      sendJson(exchange, 400, MAPPER.writeValueAsString(java.util.Map.of("error", "invalid_payload")));
    } catch (Exception e) {
      sendJson(exchange, 500, "{\"error\":\"generation_failed\"}");
      System.err.println("mdb_generation_failed class=" + e.getClass().getSimpleName());
    } finally {
      if (out != null) {
        try {
          Files.deleteIfExists(out);
        } catch (IOException ignored) {
          // best-effort cleanup
        }
      }
      if (acquired) {
        IN_FLIGHT.decrementAndGet();
        slots.release();
      }
    }
  }

  static void validatePayload(ExportPayload payload) {
    if (payload == null || payload.competition == null) {
      throw new IllegalArgumentException("competition required");
    }
    if (payload.competition.name == null || payload.competition.name.isBlank()) {
      throw new IllegalArgumentException("competition.name required");
    }
    if (payload.teams == null || payload.athletes == null || payload.events == null || payload.entries == null) {
      throw new IllegalArgumentException("teams/athletes/events/entries required");
    }
    if (payload.teams.isEmpty() || payload.athletes.isEmpty() || payload.events.isEmpty() || payload.entries.isEmpty()) {
      throw new IllegalArgumentException("export payload is empty");
    }
    if (payload.entries.size() > 20_000 || payload.athletes.size() > 5_000) {
      throw new IllegalArgumentException("export payload exceeds limits");
    }
  }

  /** Constant-time compare of Bearer tokens. */
  static boolean bearerMatches(String authorizationHeader, String expectedToken) {
    if (authorizationHeader == null || expectedToken == null || expectedToken.isBlank()) {
      return false;
    }
    String prefix = "Bearer ";
    if (!authorizationHeader.regionMatches(true, 0, prefix, 0, prefix.length())) {
      return false;
    }
    String provided = authorizationHeader.substring(prefix.length()).trim();
    byte[] a = provided.getBytes(StandardCharsets.UTF_8);
    byte[] b = expectedToken.getBytes(StandardCharsets.UTF_8);
    return MessageDigest.isEqual(a, b);
  }

  private static byte[] readBodyLimited(InputStream in, int maxBytes) throws IOException {
    byte[] buffer = in.readNBytes(maxBytes + 1);
    if (buffer.length > maxBytes) throw new BodyTooLargeException();
    return buffer;
  }

  private static void sendJson(HttpExchange exchange, int status, String json) throws IOException {
    byte[] body = json.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
    exchange.sendResponseHeaders(status, body.length);
    try (OutputStream os = exchange.getResponseBody()) {
      os.write(body);
    }
  }

  private static int parsePort(String raw, int fallback) {
    if (raw == null || raw.isBlank()) return fallback;
    return Integer.parseInt(raw.trim());
  }

  private static int parsePositive(String raw, int fallback) {
    if (raw == null || raw.isBlank()) return fallback;
    int value = Integer.parseInt(raw.trim());
    return value > 0 ? value : fallback;
  }

  private static void printUsage() {
    System.out.println(
        """
        Usage:
          java -jar mdb-exporter.jar write --in payload.json --out meet.mdb
          java -jar mdb-exporter.jar serve
        """);
  }

  private static final class BodyTooLargeException extends IOException {}
}
