import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const gatewayEnv = () =>
  createEnv({
    server: {
      HOSTNAME: z.string().min(1).default("0.0.0.0"),
      PORT: z.coerce.number().int().min(1).max(65_535).default(1999),
      REALTIME_BROADCAST_SECRET: z.string().min(32),
      REALTIME_CONNECTION_LIFETIME_MS: z.coerce
        .number()
        .int()
        .min(60_000)
        .default(1_800_000),
      REALTIME_MAX_CONNECTIONS: z.coerce.number().int().min(1).default(10_000),
      REALTIME_MAX_CONNECTIONS_PER_GUEST: z.coerce
        .number()
        .int()
        .min(1)
        .default(5),
      REALTIME_MAX_CONNECTIONS_PER_WORKSPACE: z.coerce
        .number()
        .int()
        .min(1)
        .default(500),
      REALTIME_MAX_GUEST_CONNECTIONS: z.coerce
        .number()
        .int()
        .min(1)
        .default(8000),
      REALTIME_MAX_GUEST_CONNECTIONS_PER_WORKSPACE: z.coerce
        .number()
        .int()
        .min(1)
        .default(1000),
      REDIS_URL: z.url(),
    },
    runtimeEnv: process.env,
    skipValidation: process.env.SKIP_ENV_CHECK === "true",
  })

export type RealtimeGatewayConfig = {
  connectionLifetimeMs: number
  host: string
  maxConnections: number
  maxConnectionsPerGuest: number
  maxConnectionsPerWorkspace: number
  maxGuestConnections: number
  maxGuestConnectionsPerWorkspace: number
  port: number
  redisUrl: string
  secret: string
}

export const resolveRealtimeGatewayConfig = (): RealtimeGatewayConfig => {
  const environment = gatewayEnv()
  return {
    connectionLifetimeMs: environment.REALTIME_CONNECTION_LIFETIME_MS,
    host: environment.HOSTNAME,
    maxConnections: environment.REALTIME_MAX_CONNECTIONS,
    maxConnectionsPerGuest: environment.REALTIME_MAX_CONNECTIONS_PER_GUEST,
    maxConnectionsPerWorkspace:
      environment.REALTIME_MAX_CONNECTIONS_PER_WORKSPACE,
    maxGuestConnections: environment.REALTIME_MAX_GUEST_CONNECTIONS,
    maxGuestConnectionsPerWorkspace:
      environment.REALTIME_MAX_GUEST_CONNECTIONS_PER_WORKSPACE,
    port: environment.PORT,
    redisUrl: environment.REDIS_URL,
    secret: environment.REALTIME_BROADCAST_SECRET,
  }
}
