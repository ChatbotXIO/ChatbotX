import {
  orderPaymentService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import { distributedLock } from "@chatbotx.io/redis"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../lib/logger"

const LOCK_TTL_SECONDS = 55
const BATCH_SIZE = 50
/** A backlog larger than this waits for the next minute. */
const MAX_BATCHES_PER_RUN = 10
const BLOCKED_OWNER_RECHECK_MINUTES = 60

/**
 * Every minute: online orders past their payment deadline. A payment that did
 * come in keeps its order; otherwise the order is cancelled (stock and code
 * given back, the provider's page closed). An order that cannot be settled now
 * has its deadline moved on, so the next batch reaches the others; a blocked
 * owner's orders are skipped. Then open attempts past their page's end are
 * read once more, so money nobody else settled is still refunded.
 */
export async function expireUnpaidOrders() {
  return await distributedLock.runExclusive({
    key: "schedule:expire-unpaid-orders",
    timeoutInSeconds: LOCK_TTL_SECONDS,
    fn: async () => {
      const counts = { cancelled: 0, paid: 0, deferred: 0 }
      const seen = new Set<string>()
      for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
        const orders = (
          await orderPaymentService.listOverdue({ limit: BATCH_SIZE })
        ).filter((order) => !seen.has(order.id))
        for (const order of orders) {
          seen.add(order.id)
          try {
            const outcome = await withBlockedOwnerGuard(order.workspaceId, () =>
              orderPaymentService.expireOrder({
                workspaceId: order.workspaceId,
                orderId: order.id,
              }),
            )
            if (outcome === undefined) {
              // A blocked owner: looked at again later, so their orders
              // never hold the batch up for everyone else.
              await orderPaymentService.postponeExpiry({
                workspaceId: order.workspaceId,
                orderId: order.id,
                minutes: BLOCKED_OWNER_RECHECK_MINUTES,
              })
              counts.deferred += 1
            } else if (outcome === "cancelled") {
              counts.cancelled += 1
            } else if (outcome === "paid") {
              counts.paid += 1
            } else if (outcome === "processing" || outcome === "retryLater") {
              counts.deferred += 1
            }
          } catch (error) {
            logger.warn(
              { err: normalizeError(error), orderId: order.id },
              "Expiring an unpaid order failed",
            )
          }
        }
        // Every order handled leaves the overdue list (settled or moved
        // on); one seen twice means nothing is left to do this minute.
        if (orders.length === 0) {
          break
        }
      }
      const staleAttempts = await settleStaleAttempts()
      if (
        counts.cancelled + counts.paid + counts.deferred + staleAttempts >
        0
      ) {
        logger.info(
          { ...counts, staleAttempts },
          "Unpaid order scanner settled orders",
        )
      }
      return { ...counts, staleAttempts }
    },
  })
}

/**
 * Open attempts past their page's end — a duplicate payment whose refund ran
 * out of retries, a page nobody came back to — read once more, a batch a
 * minute. A blocked owner's, and one that failed, are moved behind the others.
 */
async function settleStaleAttempts(): Promise<number> {
  const attempts = await orderPaymentService.listStaleAttempts({
    limit: BATCH_SIZE,
  })
  let settled = 0
  for (const attempt of attempts) {
    try {
      const done = await withBlockedOwnerGuard(
        attempt.workspaceId,
        async () => {
          await orderPaymentService.settleStaleAttempt(attempt)
          return true
        },
      )
      if (done) {
        settled += 1
      } else {
        await orderPaymentService.postponeStaleAttempt(attempt)
      }
    } catch (error) {
      logger.warn(
        { err: normalizeError(error), orderPaymentId: attempt.id },
        "Settling a stale payment attempt failed",
      )
      // Tried again later, so one that keeps failing never holds the batch.
      await orderPaymentService
        .postponeStaleAttempt(attempt)
        .catch((postponeError: unknown) =>
          logger.warn(
            { err: normalizeError(postponeError), orderPaymentId: attempt.id },
            "Postponing a stale payment attempt failed",
          ),
        )
    }
  }
  return settled
}
