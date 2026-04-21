# Bema — Apache Kafka broker in KRaft mode for Railway dev.
# Redpanda's seastar runtime doesn't play with Railway's shared-host
# aio-max-nr budget; Apache Kafka's JVM handles this fine.
FROM apache/kafka:3.9.1

# Configured via KAFKA_* env vars on the service. Image defaults are
# unsuitable for Railway's private networking — we override advertised
# listener via env.
