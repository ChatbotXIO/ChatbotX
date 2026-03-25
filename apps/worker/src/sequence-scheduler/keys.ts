import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const keys = () =>
  createEnv({
    server: {
      SEQUENCE_KAFKA_BROKERS: z
        .string()
        .transform((i) => i.split(","))
        .default(["localhost:9092"]),
      SEQUENCE_KAFKA_GROUP_ID: z.string().default("sequence-group"),
      SEQUENCE_KAFKA_CLENT_ID: z.string().default("sequence-client"),
    },
    runtimeEnv: process.env,
  })

export const sequenceEnv = keys()
