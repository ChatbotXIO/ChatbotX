import { db } from "@chatbotx.io/database/client"
import {
  cacheConnections,
  distributedStore,
  settledFieldFor,
} from "@chatbotx.io/redis"
import { liveKeyFor, USER_QUOTA_LABEL } from "@chatbotx.io/utils"
import { logger } from "../lib/logger"

const MAC_LIVE_FIELD = "mac"

/** Seed the live MAC counter safely, then apply the analytics delta. */
export async function incrementUserQuotaMacLiveCounter(
  userId: string,
  count: number,
): Promise<void> {
  if (count <= 0) {
    return
  }
  try {
    const client = await cacheConnections.useExisting()
    const key = liveKeyFor(USER_QUOTA_LABEL, userId)

    if ((await client.hget(key, MAC_LIVE_FIELD)) === null) {
      const quota = await db.query.userQuotaModel.findFirst({
        where: { userId },
        columns: { macUsed: true },
      })
      await distributedStore.hsetWithInflight(
        key,
        MAC_LIVE_FIELD,
        quota?.macUsed ?? 0,
        "setnx",
      )
    }

    const multi = client.multi()
    multi.hincrby(key, MAC_LIVE_FIELD, count)
    multi.hincrby(key, settledFieldFor(MAC_LIVE_FIELD), count)
    const results = await multi.exec()
    const commandError = results?.find(([error]) => error !== null)?.[0]
    if (commandError) {
      throw commandError
    }
  } catch (err) {
    logger.warn(
      { err, userId, count },
      "[MacTrackingService] user quota mac increment failed",
    )
  }
}
