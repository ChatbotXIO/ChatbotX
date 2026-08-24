import { Expo } from "expo-server-sdk"
import { env } from "../../env"
import { logger } from "../../lib/logger"

let client: Expo | null | undefined

/**
 * Lazy singleton. Returns null (and logs once) when EXPO_PUSH_ENABLED is
 * false — push notifications are opt-in infrastructure, not a hard
 * dependency of the worker.
 */
export const getExpoClient = (): Expo | null => {
  if (client !== undefined) {
    return client
  }

  if (!env.EXPO_PUSH_ENABLED) {
    logger.info("EXPO_PUSH_ENABLED is false — push notifications disabled")
    client = null
    return client
  }

  client = new Expo({ accessToken: env.EXPO_ACCESS_TOKEN })
  return client
}
