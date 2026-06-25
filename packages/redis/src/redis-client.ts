import logger from "@chatbotx.io/logger"
import { Redis, type RedisOptions } from "ioredis"

export function createRedisConnection(
  url: string,
  options: Partial<RedisOptions> = {},
): Redis {
  const config: Partial<RedisOptions> = {
    maxRetriesPerRequest: null,
    keepAlive: 5000,
    ...options,
  }

  const connection = new Redis(url, config)

  // A shared, long-lived ioredis client emits 'error' on socket-level failures
  // (server down, or — as during `next build` — a connection attempted with no
  // Redis reachable). Without a listener Node treats 'error' as unhandled:
  // ioredis logs a noisy "[ioredis] Unhandled error event", and an idle error
  // with no in-flight command can crash the process. Callers already fail fast
  // and fall back, so we only log here.
  connection.on("error", (err) => {
    logger.warn({ err }, "Redis connection error")
  })

  return connection
}
