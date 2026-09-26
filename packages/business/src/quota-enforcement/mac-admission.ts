import { macTrackingService } from "@chatbotx.io/analytics"
import {
  db,
  type StatementTimeout,
  setLocalStatementTimeout,
  type Transaction,
} from "@chatbotx.io/database/client"
import type { UserQuotaModel } from "@chatbotx.io/database/types"
import { ReservationLostError } from "../quota-shared/live-counter-store"
import type { LiveReservation, QuotaMetric } from "../user-quota/service"
import { userQuotaService } from "../user-quota/service"

/**
 * Upper bound on any single statement inside the new-contact transaction.
 * `distributedLock.runExclusive` auto-extends the Redis lock while `fn` runs,
 * so a statement blocked in Postgres (row lock, hung connection) would hold
 * the owner's MAC lock indefinitely and jam every waiter behind it.
 */
const MAC_CREATE_STATEMENT_TIMEOUT: StatementTimeout = "30s"

export type ConsumeLevel = "user" | "pool"
export type MacAdmissionStrategy = "reserve" | "lock"

export type QuotaLevel = {
  userId: string
  level: ConsumeLevel
  quota: UserQuotaModel | null
}

export type QuotaContext = {
  tenantId: string
  /** Tenant owner (reseller). `null` for the root tenant (no pool). */
  ownerId: string | null
}

export type CreateNewContactResult<T> = {
  value: T
  contactId: string
  contactInboxId: string
  inboxId: string
}

export type MacAdmissionArgs<T> = {
  ctx: QuotaContext
  levels: QuotaLevel[]
  ownerId: string
  workspaceId: string
  occurredAt: Date
  periodStart: Date | null
  lockWaitSeconds: number
  create: (tx: Transaction) => Promise<CreateNewContactResult<T>>
}

export type NewContactTransactionResult<T> = {
  value: T
  counted: boolean
}

type RunNewContactTransactionArgs<T> = Pick<
  MacAdmissionArgs<T>,
  "workspaceId" | "occurredAt" | "periodStart" | "create"
> & { touchReservations?: () => Promise<boolean> }

export type QuotaReservation = {
  touch: () => Promise<boolean>
  commit: () => Promise<void>
  release: () => Promise<void>
}

export type ReserveResult =
  | { ok: true; reservation: QuotaReservation }
  | { ok: false; level: ConsumeLevel }

export type MacAdmissionResult<T> =
  | { ok: true; value: T }
  | { ok: false; level: ConsumeLevel }

export const runNewContactTransaction = <T>(
  args: RunNewContactTransactionArgs<T>,
): Promise<NewContactTransactionResult<T>> =>
  db.transaction(async (tx) => {
    if (args.touchReservations && !(await args.touchReservations())) {
      throw new ReservationLostError()
    }
    await setLocalStatementTimeout(tx, MAC_CREATE_STATEMENT_TIMEOUT)
    const created = await args.create(tx)
    let didCount = false
    if (args.periodStart) {
      const claim = await macTrackingService.claimNewActiveContact(
        {
          workspaceId: args.workspaceId,
          contactId: created.contactId,
          contactInboxId: created.contactInboxId,
          inboxId: created.inboxId,
          periodStart: args.periodStart,
          occurredAt: args.occurredAt,
        },
        tx,
      )
      didCount = claim.counted
    }
    if (args.touchReservations && !(await args.touchReservations())) {
      throw new ReservationLostError()
    }
    return { value: created.value, counted: didCount }
  })

/**
 * Reservation is safe only for resetting plans because `reconcileMac` has no
 * ledger referee for lifetime or period-less owners. The lock preference is
 * retained as the operational rollback switch for MAC admission.
 */
export const resolveMacAdmissionStrategy = (input: {
  preferred: MacAdmissionStrategy
  levels: QuotaLevel[]
}): MacAdmissionStrategy => {
  if (input.preferred !== "reserve") {
    return "lock"
  }
  return input.levels.every(
    ({ quota }) => quota?.periodStart != null && quota.periodEnd != null,
  )
    ? "reserve"
    : "lock"
}

export const reserveLevels = async (
  levels: QuotaLevel[],
  metric: QuotaMetric,
): Promise<ReserveResult> => {
  const reserved: Array<QuotaLevel & { reservation: LiveReservation }> = []
  const release = async (): Promise<void> => {
    for (const item of reserved.toReversed()) {
      await userQuotaService.releaseReservation(
        item.userId,
        metric,
        item.reservation,
      )
    }
  }

  for (const quotaLevel of levels) {
    let reservation: LiveReservation | null
    try {
      reservation = await userQuotaService.reserve(
        quotaLevel.userId,
        metric,
        quotaLevel.quota,
      )
    } catch (err) {
      await release()
      throw err
    }
    if (!reservation) {
      await release()
      return { ok: false, level: quotaLevel.level }
    }
    reserved.push({ ...quotaLevel, reservation })
  }

  return {
    ok: true,
    reservation: {
      touch: async () => {
        const results = await Promise.all(
          reserved.map((item) =>
            userQuotaService.touchReservation(
              item.userId,
              metric,
              item.reservation,
            ),
          ),
        )
        return results.every(Boolean)
      },
      commit: async () => {
        for (const item of reserved) {
          await userQuotaService.commitReservation(
            item.userId,
            metric,
            item.reservation,
          )
        }
      },
      release,
    },
  }
}
