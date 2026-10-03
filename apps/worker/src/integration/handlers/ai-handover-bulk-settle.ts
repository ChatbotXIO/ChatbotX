import {
  AI_HANDOVER_BULK_SETTLE_CONCURRENCY,
  type BulkRunInbox,
  recordDeliveredDirectMessage,
  threadControlService,
} from "@chatbotx.io/business"
import { syncThreadOwner } from "@chatbotx.io/channel-registry/thread-control"
import type { BulkAiContactInboxRow } from "@chatbotx.io/database/repositories"
import type { AiHandoverBulkRunModel } from "@chatbotx.io/database/types"
import type {
  BulkThreadControlItemResult,
  BulkThreadControlResult,
} from "@chatbotx.io/sdk"
import pLimit from "p-limit"
import { logger } from "../../lib/logger"
import { withUnrecordedAsUnknown } from "./ai-handover-bulk-batch-accounting"

/**
 * Records one thread whose channel call succeeded. The call already happened,
 * so nothing here may throw into the batch: a bookkeeping failure is logged and
 * reported as `false` (the thread's row still reads as eligible, which matters
 * if the batch is walked again after a quota deferral).
 */
const settleSucceeded = async (props: {
  run: AiHandoverBulkRunModel
  inbox: BulkRunInbox
  row: BulkAiContactInboxRow
  result: Extract<BulkThreadControlItemResult, { status: "succeeded" }>
  dispatchedAt: Date
}): Promise<boolean> => {
  const { run, inbox, row, result, dispatchedAt } = props
  const isEnable = run.action === "enable"
  try {
    if (!isEnable && run.message) {
      // Our own echo is dropped by the webhook, so the tagged message would
      // never reach the inbox on its own.
      const recorded = await recordDeliveredDirectMessage({
        workspaceId: run.workspaceId,
        conversationId: row.conversationId,
        contactInbox: row,
        text: run.message,
        sourceId: result.messageSourceId,
      })
      if (!recorded) {
        // Delivered but not in the inbox: it cannot be sent again, so the
        // thread is still settled below; this is the trail to repair it.
        logger.error(
          {
            runId: run.id,
            contactInboxId: row.id,
            messageSourceId: result.messageSourceId,
          },
          "[ai-handover-bulk] delivered takeover message missing from the inbox",
        )
      }
    }
    const { eventApplied } = await threadControlService.recordEvent({
      workspaceId: run.workspaceId,
      inbox: { id: inbox.id, threadControlSeenAt: inbox.threadControlSeenAt },
      contactInbox: row,
      conversationId: row.conversationId,
      // What the channel did: a hand-over is a pass, a takeover a service send.
      event: result.event,
      ownerRole: result.ownerRole,
      ownerAppId: isEnable ? result.ownerAppId : null,
      previousOwnerAppId: row.threadOwnerAppId ?? null,
      occurredAt: dispatchedAt,
    })
    if (!eventApplied) {
      // A newer event (a human acted while the batch was in flight) won the
      // guarded write: Meta and our row may disagree, so ask Meta.
      await syncThreadOwner({
        workspaceId: run.workspaceId,
        contactInbox: row,
        conversationId: row.conversationId,
      })
    }
    return true
  } catch (err) {
    logger.error(
      { err, runId: run.id, contactInboxId: row.id },
      "[ai-handover-bulk] recording a delivered thread change failed",
    )
    return false
  }
}

/**
 * Records every thread the channel succeeded for, with bounded concurrency, and
 * returns what the batch's accounting should read: how many were processed and
 * the results, where a takeover that was delivered but could not be recorded
 * counts as an outcome that must not be repeated (never also as processed).
 */
export const settleBatchResults = async (props: {
  run: AiHandoverBulkRunModel
  inbox: BulkRunInbox
  batch: BulkAiContactInboxRow[]
  response: BulkThreadControlResult
  dispatchedAt: Date
}): Promise<{
  processed: number
  results: BulkThreadControlItemResult[]
}> => {
  const { run, inbox, batch, response, dispatchedAt } = props
  const limit = pLimit(AI_HANDOVER_BULK_SETTLE_CONCURRENCY)
  const byId = new Map(batch.map((row) => [row.id, row]))
  let processed = 0
  // Only a takeover is unsafe to walk again (an enable's pass is idempotent).
  const unrecordedIds = new Set<string>()
  await Promise.all(
    response.results.map((result) =>
      limit(async () => {
        const row = byId.get(result.contactInboxId)
        if (row && result.status === "succeeded") {
          const isRecorded = await settleSucceeded({
            run,
            inbox,
            row,
            result,
            dispatchedAt,
          })
          if (!isRecorded && run.action === "disable") {
            unrecordedIds.add(row.id)
          }
          processed += 1
        }
      }),
    ),
  )

  const results = withUnrecordedAsUnknown(response.results, unrecordedIds)
  const converted = results.filter(
    (result, index) => result.status !== response.results[index].status,
  ).length
  return { processed: processed - converted, results }
}
