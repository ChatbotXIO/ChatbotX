import { createRedisConnection } from "@chatbotx.io/redis"
import { createRealtimeGateway } from "./gateway"
import {
  describeRedisEndpoint,
  resolveRealtimeGatewayConfig,
} from "./gateway-config"
import { logger } from "./logger"
import { createShutdownHandler } from "./shutdown"

const main = async (): Promise<void> => {
  const { host, port, redisUrl, ...gatewayConfig } =
    resolveRealtimeGatewayConfig()
  const gateway = createRealtimeGateway({
    ...gatewayConfig,
    redis: createRedisConnection(redisUrl),
  })
  const shutdown = createShutdownHandler(gateway)

  process.once("SIGINT", shutdown.bind(null, "SIGINT"))
  process.once("SIGTERM", shutdown.bind(null, "SIGTERM"))

  try {
    await gateway.listen(host, port)
  } catch (error) {
    logger.error({ err: error }, "Realtime gateway failed to start")
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
      host,
      port,
      redis: describeRedisEndpoint(redisUrl),
    },
    "Realtime gateway listening",
  )
}

main().catch((error: unknown) => {
  logger.error({ err: error }, "Unhandled realtime gateway startup error")
  process.exit(1)
})
