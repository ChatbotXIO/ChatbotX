import type { WhatsappCallModel } from "@chatbotx.io/database/types"

/**
 * ESL-gap reconciliation loop. Deliberately injectable rather than
 * importing the repository/ESL client directly, so the same logic is
 * exercised in `apps/worker/__tests__/freeswitch-reconciliation.test.ts`
 * without a live FreeSWITCH or database.
 */
export type ReconciliationDeps = {
  /** `show channels as json` over ESL, reduced to the set of live channel uuids on this node. */
  listLiveUuids: () => Promise<ReadonlySet<string>>
  /** `ringing`/`accepted` rows for this node's integrations. */
  listActiveByIntegrationIds: (
    integrationIds: string[],
  ) => Promise<WhatsappCallModel[]>
  finalizeById: (input: {
    id: string
    status: "completed" | "failed"
    endedAt: Date
    lastError: string
    current: WhatsappCallModel
  }) => Promise<unknown>
  /** Best-effort realtime notification — a failure here must not block finalizing the row. */
  emitEnded?: (call: WhatsappCallModel) => Promise<void>
}

export type ReconciliationResult = { finalized: number }

const RECONCILED_LAST_ERROR = "reconciled-after-esl-gap"

/**
 * A row whose `freeswitchUuid` is set but no longer among the live channels
 * on this node means the call ended while events were lost. Rows
 * with a null uuid are the sweeper's job, not this loop's — they were
 * never confirmed live in the first place.
 */
export const reconcileFreeswitchNode = async (
  input: { integrationIds: string[] },
  deps: ReconciliationDeps,
): Promise<ReconciliationResult> => {
  const live = await deps.listLiveUuids()
  const rows = await deps.listActiveByIntegrationIds(input.integrationIds)

  let finalized = 0
  for (const row of rows) {
    if (!row.freeswitchUuid || live.has(row.freeswitchUuid)) {
      continue
    }

    const status = row.status === "accepted" ? "completed" : "failed"
    await deps.finalizeById({
      id: row.id,
      status,
      endedAt: new Date(),
      lastError: RECONCILED_LAST_ERROR,
      current: row,
    })
    finalized++

    if (deps.emitEnded) {
      await deps.emitEnded(row).catch(() => undefined)
    }
  }

  return { finalized }
}
