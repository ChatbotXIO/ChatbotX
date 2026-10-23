import { PRESENCE_REPORT_INTERVAL_MS } from "@chatbotx.io/realtime-protocol/presence"
import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

const PRESENCE_REPORT_COALESCE_MS = 1000

const gatewayEnv = (runtimeEnv: NodeJS.ProcessEnv) =>
  createEnv({
    server: {
      REALTIME_HOST: z.string().min(1).default("0.0.0.0"),
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
      REALTIME_SHUTDOWN_DRAIN_MS: z.coerce.number().int().min(0).default(5000),
      NEXT_PUBLIC_BUILDER_URL: z.url(),
      REDIS_REALTIME_URL: z.url().optional(),
      REDIS_URL: z.url(),
    },
    runtimeEnv,
    skipValidation: runtimeEnv.SKIP_ENV_CHECK === "true",
  })

export type RealtimeGatewayConfig = {
  builderUrl: string
  connectionLifetimeMs: number
  maxConnections: number
  maxConnectionsPerGuest: number
  maxConnectionsPerWorkspace: number
  maxGuestConnections: number
  maxGuestConnectionsPerWorkspace: number
  presenceReportCoalesceMs: number
  presenceReportIntervalMs: number
  shutdownDrainMs: number
  secret: string
}

type RealtimeRuntimeConfig = RealtimeGatewayConfig & {
  host: string
  port: number
  redisUrl: string
}

export const resolveRealtimeGatewayConfig = (
  runtimeEnv: NodeJS.ProcessEnv = process.env,
): RealtimeRuntimeConfig => {
  const environment = gatewayEnv(runtimeEnv)
  return {
    builderUrl: environment.NEXT_PUBLIC_BUILDER_URL,
    connectionLifetimeMs: environment.REALTIME_CONNECTION_LIFETIME_MS,
    host: environment.REALTIME_HOST,
    maxConnections: environment.REALTIME_MAX_CONNECTIONS,
    maxConnectionsPerGuest: environment.REALTIME_MAX_CONNECTIONS_PER_GUEST,
    maxConnectionsPerWorkspace:
      environment.REALTIME_MAX_CONNECTIONS_PER_WORKSPACE,
    maxGuestConnections: environment.REALTIME_MAX_GUEST_CONNECTIONS,
    maxGuestConnectionsPerWorkspace:
      environment.REALTIME_MAX_GUEST_CONNECTIONS_PER_WORKSPACE,
    port: environment.PORT,
    presenceReportCoalesceMs: PRESENCE_REPORT_COALESCE_MS,
    presenceReportIntervalMs: PRESENCE_REPORT_INTERVAL_MS,
    redisUrl: environment.REDIS_REALTIME_URL ?? environment.REDIS_URL,
    shutdownDrainMs: environment.REALTIME_SHUTDOWN_DRAIN_MS,
    secret: environment.REALTIME_BROADCAST_SECRET,
  }
}

const DEFAULT_REDIS_PORT = "6379"
const DEFAULT_REDIS_DATABASE = "0"
const UNPARSEABLE_REDIS_ENDPOINT: RedisEndpointDescription = {
  database: "unknown",
  host: "unparseable",
  port: "unknown",
}

type RedisEndpointDescription = {
  database: string
  host: string
  port: string
}

/**
 * Host, port and logical database of a Redis URL, with credentials dropped, so
 * a startup log can show which Redis the gateway reads without leaking secrets.
 * Publishers and the gateway must resolve to the same endpoint. Never throws
 * and never echoes the raw URL, which may hold a password: a value `new URL`
 * rejects (accepted only when `SKIP_ENV_CHECK` bypasses validation) yields
 * placeholders.
 */
export const describeRedisEndpoint = (
  redisUrl: string,
): RedisEndpointDescription => {
  try {
    const { hostname, pathname, port, searchParams } = new URL(redisUrl)
    return {
      // ioredis reads the path first and falls back to the `db` parameter.
      database:
        pathname.slice(1) || searchParams.get("db") || DEFAULT_REDIS_DATABASE,
      host: hostname,
      port: port || DEFAULT_REDIS_PORT,
    }
  } catch {
    return UNPARSEABLE_REDIS_ENDPOINT
  }
}
