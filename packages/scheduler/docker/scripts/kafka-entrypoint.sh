#!/bin/bash
set -e

# Generate JAAS config from template with environment variable substitution
sed "s/\${KAFKA_ADMIN_PASSWORD}/${KAFKA_ADMIN_PASSWORD}/g" /etc/kafka/kafka_server_jaas.conf.template > /etc/kafka/kafka_server_jaas.conf

# Start Kafka with the original entrypoint
exec /etc/confluent/docker/run
