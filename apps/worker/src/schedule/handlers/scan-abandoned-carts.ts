import { webshopService, withBlockedOwnerGuard } from "@chatbotx.io/business"
import { distributedLock } from "@chatbotx.io/redis"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"

const LOCK_TTL_SECONDS = 55
const BATCH_SIZE = 100
/** A backlog larger than this waits for the next minute. */
const MAX_BATCHES_PER_RUN = 20

/**
 * Every minute: reminds the carts left longer than their store's
 * abandoned-cart delay — the `cartAbandoned` event and the store's flow.
 * Each cart is claimed once (`abandonedNotifiedAt`), so a failed reminder is
 * logged, not retried; a blocked owner's carts are claimed and skipped.
 */
export async function scanAbandonedCarts() {
  return await distributedLock.runExclusive({
    key: "schedule:scan-abandoned-carts",
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      let reminded = 0
      for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
        const carts = await webshopService.claimAbandonedCarts({
          limit: BATCH_SIZE,
        })
        for (const cart of carts) {
          try {
            const result = await withBlockedOwnerGuard(cart.workspaceId, () =>
              webshopService.remindAbandonedCart(cart),
            )
            if (result === "reminded") {
              reminded += 1
            }
          } catch (error) {
            logger.warn(
              { err: normalizeError(error), cartId: cart.id },
              "Abandoned cart reminder failed",
            )
          }
        }
        if (carts.length < BATCH_SIZE) {
          break
        }
      }
      if (reminded > 0) {
        logger.info({ reminded }, "Abandoned cart scanner reminded carts")
      }
      return { reminded }
    },
  })
}
