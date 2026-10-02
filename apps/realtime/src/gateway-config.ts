import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const gatewayEnv = () =>
  createEnv({
    server: {
      HOSTNAME: z.string().min(1).default("0.0.0.0"),
      PORT: z.coerce.number().int().min(1).max(65_535).default(1999),
      REALTIME_BROADCAST_SECRET: z.string().min(32),
      REALTIME_MAX_CONNECTIONS: z.coerce.number().int().min(1).default(10_000),
      REDIS_URL: z.url(),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

export type RealtimeGatewayConfig = {
  host: string
  maxConnections: number
  port: number
  redisUrl: string
  secret: string
}

export const resolveRealtimeGatewayConfig = (): RealtimeGatewayConfig => {
  const environment = gatewayEnv()
  return {
    host: environment.HOSTNAME,
    maxConnections: environment.REALTIME_MAX_CONNECTIONS,
    port: environment.PORT,
    redisUrl: environment.REDIS_URL,
    secret: environment.REALTIME_BROADCAST_SECRET,
  }
}
