import { macTrackingService } from "@chatbotx.io/analytics"
import {
  db,
  type StatementTimeout,
  setLocalStatementTimeout,
  type Transaction,
} from "@chatbotx.io/database/client"
import type { UserQuotaModel } from "@chatbotx.io/database/types"
import {
  captureException,
  classifyError,
  incrementSideEffectFailed,
} from "@chatbotx.io/observability"
import { logger } from "../logger"
import type { MacAdmissionStrategy } from "./keys"

/**
 * Upper bound on any single statement inside the new-contact transaction.
 * `distributedLock.runExclusive` auto-extends the Redis lock while `fn` runs,
 * so a statement blocked in Postgres (row lock, hung connection) would hold
 * the owner's MAC lock indefinitely and jam every waiter behind it.
 */
const MAC_CREATE_STATEMENT_TIMEOUT: StatementTimeout = "30s"

export type ConsumeLevel = "user" | "pool"
export type { MacAdmissionStrategy } from "./keys"

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
  lockWaitSeconds: number
  create: (tx: Transaction) => Promise<CreateNewContactResult<T>>
}

export type NewContactTransactionResult<T> = {
  value: T
  counted: boolean
}

export type MacAdmissionResult<T> =
  | { ok: true; value: T }
  | { ok: false; level: ConsumeLevel }

export type MacAdmitter = <T>(
  args: MacAdmissionArgs<T>,
) => Promise<MacAdmissionResult<T>>

export type MacPostCommitArgs = {
  ctx: QuotaContext
  ownerId: string
  workspaceId: string
  counted: boolean
}

export const runNewContactTransaction = <T>(
  args: Pick<MacAdmissionArgs<T>, "workspaceId" | "occurredAt" | "create"> & {
    periodStart: Date | null
  },
): Promise<NewContactTransactionResult<T>> =>
  db.transaction(async (tx) => {
    await setLocalStatementTimeout(tx, MAC_CREATE_STATEMENT_TIMEOUT)
    const created = await args.create(tx)
    let counted = false
    const periodStart = args.periodStart
    if (periodStart) {
      try {
        const claim = await tx.transaction(
          async (claimTx) =>
            await macTrackingService.claimNewActiveContact(
              {
                workspaceId: args.workspaceId,
                contactId: created.contactId,
                contactInboxId: created.contactInboxId,
                inboxId: created.inboxId,
                periodStart,
                occurredAt: args.occurredAt,
              },
              claimTx,
            ),
        )
        counted = claim.counted
      } catch (error) {
        const errorClass = classifyError(error)
        logger.error(
          {
            err: error,
            workspaceId: args.workspaceId,
            contactId: created.contactId,
          },
          "MAC claim failed after contact creation; allowing messaging to continue",
        )
        incrementSideEffectFailed("mac_claim")
        captureException({
          error,
          errorClass,
          tags: { side_effect: "mac_claim" },
        })
      }
    }
    return { value: created.value, counted }
  })

/**
 * Atomic admission is safe only when every quota level has a resetting period.
 * The preference table handles the operational lock rollback switch first.
 */
const resolveMacAdmissionStrategy = (input: {
  levels: QuotaLevel[]
}): MacAdmissionStrategy =>
  input.levels.every(
    ({ quota }) => quota?.periodStart != null && quota.periodEnd != null,
  )
    ? "atomic"
    : "lock"

type MacAdmissionResolution = {
  strategy: MacAdmissionStrategy
  levels: QuotaLevel[]
}

type MacAdmissionPreferenceResolver = (
  loadLevels: () => Promise<QuotaLevel[]>,
) => Promise<MacAdmissionResolution>

const macAdmissionPreferenceResolvers: Record<
  MacAdmissionStrategy,
  MacAdmissionPreferenceResolver
> = {
  lock: () => Promise.resolve({ strategy: "lock", levels: [] }),
  atomic: async (loadLevels) => {
    const levels = await loadLevels()
    return {
      strategy: resolveMacAdmissionStrategy({ levels }),
      levels,
    }
  },
}

export const resolveMacAdmissionPreference = (input: {
  preferred: MacAdmissionStrategy
  loadLevels: () => Promise<QuotaLevel[]>
}): Promise<MacAdmissionResolution> =>
  macAdmissionPreferenceResolvers[input.preferred](input.loadLevels)
