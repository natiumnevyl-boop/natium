FROM eclipse-temurin:21-jre-jammy
WORKDIR /app
COPY tools/mdb-exporter/target/mdb-exporter-1.0.0.jar /app/mdb-exporter.jar
ENV MDB_EXPORTER_TOKEN=changeme
EXPOSE 8088
USER 10001
CMD ["java", "-jar", "/app/mdb-exporter.jar", "serve", "--port", "8088"]
