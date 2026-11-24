# syntax=docker/dockerfile:1.7

# --- build (JDK + Maven) ------------------------------------------------------
FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /src
COPY tools/mdb-exporter/pom.xml /src/pom.xml
COPY tools/mdb-exporter/src /src/src
RUN apt-get update \
  && apt-get install -y --no-install-recommends maven \
  && rm -rf /var/lib/apt/lists/* \
  && mvn -q -DskipTests package \
  && mv target/mdb-exporter-1.0.0.jar /src/mdb-exporter.jar

# --- runtime (JRE only) -------------------------------------------------------
FROM eclipse-temurin:21-jre-jammy
WORKDIR /app

# Free-tier friendly heap: leave headroom for native/Jackcess temp files.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=55.0 -XX:+ExitOnOutOfMemoryError -Djava.awt.headless=true" \
    PORT=8088 \
    MDB_MAX_BODY_BYTES=2000000 \
    MDB_MAX_CONCURRENT=2

COPY --from=build /src/mdb-exporter.jar /app/mdb-exporter.jar

EXPOSE 8088
USER 10001:10001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/${PORT:-8088} && printf 'GET /health HTTP/1.1\\r\\nHost: localhost\\r\\nConnection: close\\r\\n\\r\\n' >&3 && grep -q '200' <&3"]

CMD ["bash", "-c", "exec java -jar /app/mdb-exporter.jar serve --port \"${PORT:-8088}\""]
