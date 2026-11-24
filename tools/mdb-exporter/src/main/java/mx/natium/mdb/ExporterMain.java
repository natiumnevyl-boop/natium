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
import java.util.concurrent.Executors;

/**
 * CLI and optional HTTP server for Meet Manager MDB generation.
 *
 * <pre>
 *   java -jar mdb-exporter.jar write --in payload.json --out meet.mdb
 *   java -jar mdb-exporter.jar serve --port 8088 --token SECRET
 * </pre>
 */
public final class ExporterMain {
  private static final ObjectMapper MAPPER = new ObjectMapper();

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
    MeetManagerWriter.write(payload, out);
    System.out.println("Wrote " + out.toAbsolutePath());
  }

  private static void serveCommand(String[] args) throws Exception {
    int port = 8088;
    String token = System.getenv().getOrDefault("MDB_EXPORTER_TOKEN", "");
    for (int i = 1; i < args.length; i++) {
      switch (args[i]) {
        case "--port" -> port = Integer.parseInt(args[++i]);
        case "--token" -> token = args[++i];
        default -> throw new IllegalArgumentException("Unknown argument: " + args[i]);
      }
    }
    if (token.isBlank()) {
      throw new IllegalStateException("Set MDB_EXPORTER_TOKEN or pass --token");
    }
    String expected = token;
    HttpServer server = HttpServer.create(new InetSocketAddress(port), 0);
    server.createContext(
        "/health",
        exchange -> {
          byte[] body = "{\"ok\":true}".getBytes(StandardCharsets.UTF_8);
          exchange.getResponseHeaders().add("Content-Type", "application/json");
          exchange.sendResponseHeaders(200, body.length);
          try (OutputStream os = exchange.getResponseBody()) {
            os.write(body);
          }
        });
    server.createContext(
        "/v1/generate-mdb",
        exchange -> {
          try {
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
              sendJson(exchange, 405, "{\"error\":\"method_not_allowed\"}");
              return;
            }
            String auth = exchange.getRequestHeaders().getFirst("Authorization");
            if (auth == null || !auth.equals("Bearer " + expected)) {
              sendJson(exchange, 401, "{\"error\":\"unauthorized\"}");
              return;
            }
            byte[] requestBody;
            try (InputStream is = exchange.getRequestBody()) {
              requestBody = is.readAllBytes();
            }
            ExportPayload payload = MAPPER.readValue(requestBody, ExportPayload.class);
            Path out = Files.createTempFile("natium-export-", ".mdb");
            try {
              MeetManagerWriter.write(payload, out);
              byte[] file = Files.readAllBytes(out);
              Headers headers = exchange.getResponseHeaders();
              headers.add("Content-Type", "application/x-msaccess");
              headers.add("Content-Disposition", "attachment; filename=\"inscripciones.mdb\"");
              exchange.sendResponseHeaders(200, file.length);
              try (OutputStream os = exchange.getResponseBody()) {
                os.write(file);
              }
            } finally {
              Files.deleteIfExists(out);
            }
          } catch (Exception e) {
            String msg = e.getMessage() == null ? "generation_failed" : e.getMessage();
            sendJson(exchange, 400, MAPPER.writeValueAsString(java.util.Map.of("error", msg)));
          }
        });
    server.setExecutor(Executors.newFixedThreadPool(4));
    server.start();
    System.out.println("MDB exporter listening on :" + port);
  }

  private static void sendJson(HttpExchange exchange, int status, String json) throws IOException {
    byte[] body = json.getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().add("Content-Type", "application/json");
    exchange.sendResponseHeaders(status, body.length);
    try (OutputStream os = exchange.getResponseBody()) {
      os.write(body);
    }
  }

  private static void printUsage() {
    System.out.println(
        """
        Usage:
          java -jar mdb-exporter.jar write --in payload.json --out meet.mdb
          java -jar mdb-exporter.jar serve --port 8088 --token SECRET
        """);
  }
}
