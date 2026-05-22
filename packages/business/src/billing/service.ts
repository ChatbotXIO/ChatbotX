import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { billingModel } from "@chatbotx.io/database/schema"
import type { BillingModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { logger } from "../logger"

/**
 * Truncate a timestamp to the start of its minute. The billing window — and
 * the MAC monthly period anchored on it — never needs sub-minute precision,
 * so this keeps `periodStart` values tidy and matches the migration backfill.
 */
function truncateToMinute(date: Date): Date {
  const copy = new Date(date)
  copy.setSeconds(0, 0)
  return copy
}

class BillingService extends BaseService {
  async find(props: {
    userId: string
    tx?: DatabaseClient
  }): Promise<BillingModel | undefined> {
    const client = props.tx ?? db
    return await client.query.billingModel.findFirst({
      where: { userId: props.userId },
    })
  }

  /**
   * Guarantee a `Billing` row exists for `userId`. Called after user creation
   * and on every login (covers users created before this feature shipped). A
   * no-op when a row is already present.
   */
  async ensureForUser(props: {
    userId: string
    tx?: DatabaseClient
  }): Promise<BillingModel> {
    const client = props.tx ?? db

    const existing = await this.find({ userId: props.userId, tx: client })
    if (existing) {
      return existing
    }

    const [created] = await client
      .insert(billingModel)
      .values({
        userId: props.userId,
        periodStart: truncateToMinute(new Date()),
        status: "active",
      })
      .returning()

    logger.info(
      { userId: props.userId, billingId: created?.id },
      "Billing created",
    )
    return created as BillingModel
  }

  /**
   * Fire-and-forget variant for auth hooks: never throws, so a billing write
   * failure can never block sign-up or login. Errors are logged instead.
   */
  async ensureForUserSafe(props: { userId: string }): Promise<void> {
    try {
      await this.ensureForUser({ userId: props.userId })
    } catch (error) {
      logger.error(
        { userId: props.userId, error },
        "Failed to ensure Billing for user",
      )
    }
  }
}

export const billingService = new BillingService()
