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
    try {
      await gateway.close()
    } catch (error) {
      logger.error(
        { err: error, signal },
        "Error while stopping realtime gateway",
      )
    }
  }

  process.once("SIGINT", shutdown.bind(null, "SIGINT"))
  process.once("SIGTERM", shutdown.bind(null, "SIGTERM"))

  try {
    await gateway.listen(config.host, config.port)
  } catch (error) {
    logger.error({ err: error }, "Realtime gateway failed to start")
    // The gateway's streamReader/redis connections otherwise keep the event
    // loop alive forever after a failed `listen()` — `exitCode` alone just
    // sets the eventual code and waits for those handles to drain, which
    // they never do on their own. Close them, then force the exit. See PR
    // #1349 finding #5.
    try {
      await gateway.close()
    } catch (closeError) {
      logger.error(
        { err: closeError },
        "Error while closing realtime gateway after failed start",
      )
    }
    process.exit(1)
  }
  logger.info(
    {
      host: config.host,
      port: config.port,
    },
    "Realtime gateway listening",
  )
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "Unhandled realtime gateway startup error")
  process.exit(1)
})
