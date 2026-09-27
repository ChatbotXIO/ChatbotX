import { REALTIME_STREAM_SHARD_COUNT } from "@chatbotx.io/partysocket-config"
import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const shardListSchema = z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform((value, context) => {
    if (!value) {
      return Array.from(
        { length: REALTIME_STREAM_SHARD_COUNT },
        (_, shard) => shard,
      )
    }

    const shards = value.split(",").map((entry) => Number(entry.trim()))
    const uniqueShards = new Set(shards)
    const hasInvalidShard = shards.some(
      (shard) =>
        !Number.isInteger(shard) ||
        shard < 0 ||
        shard >= REALTIME_STREAM_SHARD_COUNT,
    )
    if (hasInvalidShard || uniqueShards.size !== shards.length) {
      context.addIssue({
        code: "custom",
        message: `REALTIME_STREAM_SHARDS must be unique shard IDs between 0 and ${REALTIME_STREAM_SHARD_COUNT - 1}`,
      })
      return z.NEVER
    }
    return [...uniqueShards].sort((left, right) => left - right)
  })

const gatewayEnv = () =>
  createEnv({
    server: {
      HOSTNAME: z.string().min(1).default("0.0.0.0"),
      PORT: z.coerce.number().int().min(1).max(65_535).default(1999),
      REALTIME_BROADCAST_SECRET: z.string().min(32),
      REALTIME_CONSUMER_GROUP: z.string().min(1).default("realtime-gateway"),
      REALTIME_CONSUMER_NAME: z
        .string()
        .min(1)
        .default(`gateway-${process.pid}`),
      REALTIME_STREAM_SHARDS: shardListSchema,
      REDIS_URL: z.url(),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

export type RealtimeGatewayConfig = {
  consumerGroup: string
  consumerName: string
  host: string
  port: number
  redisUrl: string
  secret: string
  shards: number[]
}

export const resolveRealtimeGatewayConfig = (): RealtimeGatewayConfig => {
  const environment = gatewayEnv()
  return {
    consumerGroup: environment.REALTIME_CONSUMER_GROUP,
    consumerName: environment.REALTIME_CONSUMER_NAME,
    host: environment.HOSTNAME,
    port: environment.PORT,
    redisUrl: environment.REDIS_URL,
    secret: environment.REALTIME_BROADCAST_SECRET,
    shards: environment.REALTIME_STREAM_SHARDS,
  }
}
