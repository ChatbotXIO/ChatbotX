import { createRedisConnection } from "@chatbotx.io/redis"
import { createRealtimeGateway } from "./gateway"
import { resolveRealtimeGatewayConfig } from "./gateway-config"
import { logger } from "./logger"

export const main = async (): Promise<void> => {
  const config = resolveRealtimeGatewayConfig()
  const gateway = createRealtimeGateway({
    connectionLifetimeMs: config.connectionLifetimeMs,
    maxConnections: config.maxConnections,
    maxConnectionsPerGuest: config.maxConnectionsPerGuest,
    maxConnectionsPerWorkspace: config.maxConnectionsPerWorkspace,
    maxGuestConnections: config.maxGuestConnections,
    maxGuestConnectionsPerWorkspace: config.maxGuestConnectionsPerWorkspace,
    redis: createRedisConnection(config.redisUrl),
    secret: config.secret,
  })
  let shuttingDown = false

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    logger.info({ signal }, "Stopping realtime gateway")
    await gateway.close()
  }

  process.once("SIGINT", shutdown.bind(null, "SIGINT"))
  process.once("SIGTERM", shutdown.bind(null, "SIGTERM"))

  await gateway.listen(config.host, config.port)
  logger.info(
    {
      host: config.host,
      port: config.port,
    },
    "Realtime gateway listening",
  )
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "Realtime gateway failed to start")
  process.exitCode = 1
})
