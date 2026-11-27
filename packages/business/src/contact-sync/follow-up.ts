import { db } from "@chatbotx.io/database/client"
import type { ContactSyncFollowUpError } from "@chatbotx.io/database/partials"
import {
  coexistSyncRunRepository,
  contactSyncRunRepository,
} from "@chatbotx.io/database/repositories"
import { getChildLogger } from "@chatbotx.io/logger"
import { coexistService } from "../coexist/service"
import { resolveWorkspaceFreezeReasonById } from "../workspace-lifecycle/with-blocked-owner-guard"
import {
  CONTACT_SYNC_FOLLOW_UP_BATCH_SIZE,
  CONTACT_SYNC_FOLLOW_UP_ERRORS,
  CONTACT_SYNC_FOLLOW_UP_MAX_AGE_HOURS,
  isContactSyncFollowUpChannel,
} from "./constants"

const log = getChildLogger("contact-sync-follow-up")

export type FollowUpHandoffResult =
  | { outcome: "notOwed" }
  | { outcome: "linked"; coexistRunId: string }
  | { outcome: "failed"; error: ContactSyncFollowUpError }

/**
 * Hands one closed import item off to the normal history sync (coexist), once.
 * Every terminal status hands off (a failed or cancelled contacts import still
 * starts history); a page that went away, a superseding import or an unavailable
 * workspace ends the follow-up with its reason instead.
 *
 * Lock order: the page's integration row first (what a history start and a
 * connect start also take first), then the item row. In one transaction the
 * coexist run is created or reused and the item is linked to it, so a crash
 * leaves nothing half-done and a duplicate delivery changes nothing.
 */
export const handOffContactSyncFollowUp = async (
  itemId: string,
): Promise<FollowUpHandoffResult> => {
  const item = await db.query.contactSyncRunItemModel.findFirst({
    where: { id: itemId },
  })
  if (
    !item ||
    item.followUpRunId ||
    item.followUpError ||
    !item.followUpCoexist
  ) {
    return { outcome: "notOwed" }
  }
  const frozen = await resolveWorkspaceFreezeReasonById(item.workspaceId)
  if (frozen.freezeReason) {
    return await fail(
      itemId,
      CONTACT_SYNC_FOLLOW_UP_ERRORS.workspaceUnavailable,
    )
  }
  const inbox = item.inboxId
    ? await db.query.inboxModel.findFirst({
        where: {
          id: item.inboxId,
          workspaceId: item.workspaceId,
          status: "connected",
        },
        columns: { id: true, channel: true },
      })
    : null
  if (!(inbox && isContactSyncFollowUpChannel(inbox.channel))) {
    return await fail(itemId, CONTACT_SYNC_FOLLOW_UP_ERRORS.channelUnavailable)
  }

  const { channel } = inbox
  return await db.transaction(async (tx): Promise<FollowUpHandoffResult> => {
    const integrationId =
      await coexistSyncRunRepository.findIntegrationIdByInbox({
        channel,
        workspaceId: item.workspaceId,
        inboxId: inbox.id,
        tx,
      })
    if (!integrationId) {
      await contactSyncRunRepository.failFollowUp(
        { itemId, error: CONTACT_SYNC_FOLLOW_UP_ERRORS.channelUnavailable },
        tx,
      )
      return {
        outcome: "failed",
        error: CONTACT_SYNC_FOLLOW_UP_ERRORS.channelUnavailable,
      }
    }
    await coexistSyncRunRepository.lockIntegration({
      channel,
      workspaceId: item.workspaceId,
      integrationId,
      tx,
    })
    // Re-read under the lock: a duplicate delivery or a cancel got here first.
    const owed = await contactSyncRunRepository.lockOwedFollowUp(itemId, tx)
    if (!owed) {
      return { outcome: "notOwed" }
    }

    const enabled = await coexistService.enable(
      {
        workspaceId: item.workspaceId,
        integrationId,
        channel,
        aiReadsSyncedHistory: owed.followUpAiReadsSyncedHistory,
      },
      tx,
    )
    if (enabled.success) {
      await contactSyncRunRepository.linkFollowUpRun(
        { itemId, runId: enabled.runId },
        tx,
      )
      return { outcome: "linked", coexistRunId: enabled.runId }
    }
    const error =
      enabled.reason === "contact_import_running"
        ? CONTACT_SYNC_FOLLOW_UP_ERRORS.superseded
        : CONTACT_SYNC_FOLLOW_UP_ERRORS.channelUnavailable
    await contactSyncRunRepository.failFollowUp({ itemId, error }, tx)
    return { outcome: "failed", error }
  })
}

const fail = async (
  itemId: string,
  error: ContactSyncFollowUpError,
): Promise<FollowUpHandoffResult> => {
  await contactSyncRunRepository.failFollowUp({ itemId, error })
  return { outcome: "failed", error }
}

/**
 * The recovery sweep: gives up on follow-ups owed for more than a day, then
 * hands off a batch of the closed items still owing one, whichever path closed
 * them (the engine, a run's finish, a cancel, retry exhaustion). One item's
 * failure never stops the others.
 */
export const sweepContactSyncFollowUps = async (): Promise<number> => {
  await contactSyncRunRepository.expireOwedFollowUps({
    maxAgeHours: CONTACT_SYNC_FOLLOW_UP_MAX_AGE_HOURS,
    batchSize: CONTACT_SYNC_FOLLOW_UP_BATCH_SIZE,
  })
  const owed = await contactSyncRunRepository.listOwedFollowUps({
    batchSize: CONTACT_SYNC_FOLLOW_UP_BATCH_SIZE,
  })
  let linked = 0
  for (const item of owed) {
    try {
      const result = await handOffContactSyncFollowUp(item.id)
      linked += result.outcome === "linked" ? 1 : 0
    } catch (err) {
      log.error(
        { err, itemId: item.id },
        "contact sync: follow-up handoff failed",
      )
    }
  }
  return linked
}
