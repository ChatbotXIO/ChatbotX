import { echoCollectorFactory } from "@chatbotx.io/redis"
import { getRedisConnection } from "../../lib/connection"

export * from "./messenger-echo-env"

export const echoCollector = echoCollectorFactory(async () =>
  getRedisConnection(),
)
