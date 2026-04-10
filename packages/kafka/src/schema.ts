import { z } from "zod"

export const kafkaEnvSchema = z.object({
  KAFKA_BROKERS: z.string().default("localhost:9092"),
  KAFKA_SSL_ENABLED: z.string().optional(),
  KAFKA_SASL_USERNAME: z.string().optional(),
  KAFKA_SASL_PASSWORD: z.string().optional(),
  KAFKA_PARTITIONS: z.number().default(1),
  KAFKA_REPLICATION_FACTOR: z.number().default(1),
})

export type KafkaEnv = z.infer<typeof kafkaEnvSchema>
