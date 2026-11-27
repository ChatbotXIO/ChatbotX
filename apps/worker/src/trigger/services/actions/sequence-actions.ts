import { contactSequenceService } from "@chatbotx.io/business/contact-sequence"
import { MAX_SEQUENCES_PER_TRIGGER_ACTION } from "@chatbotx.io/database/partials"
import baseLogger from "@chatbotx.io/logger"
import { z } from "zod"
import { skipped, succeeded, type TriggerActionHandler } from "./types"

const sequenceActionSchema = z.object({
  sequenceIds: z.array(z.string()).min(1).max(MAX_SEQUENCES_PER_TRIGGER_ACTION),
})

/** The sequence ids of a stored action, or `null` (with a warning) when it is malformed. */
const parseSequenceIds = (
  action: Record<string, unknown>,
  actionType: string,
): string[] | null => {
  const parsed = sequenceActionSchema.safeParse(action)
  if (parsed.success) {
    return parsed.data.sequenceIds
  }
  baseLogger.warn(
    { issues: parsed.error.issues },
    `Invalid ${actionType} action payload, skipping`,
  )
  return null
}

/**
 * Subscribes the contact to the given sequences. Does not emit
 * `subscribedToSequence`, so it cannot re-fire sequence triggers (loop safety;
 * see `contactSequenceService.subscribeContactForTrigger`).
 */
export const addSequence: TriggerActionHandler = async ({
  context,
  conversation,
}) => {
  const sequenceIds = parseSequenceIds(context.action, "addSequence")
  if (!sequenceIds) {
    return skipped("invalidAction")
  }

  const { ownedSequenceIds } =
    await contactSequenceService.subscribeContactForTrigger({
      workspaceId: context.workspaceId,
      contactId: conversation.contactId,
      sequenceIds,
    })
  return ownedSequenceIds.length === 0 ? skipped("sequenceNotFound") : succeeded
}

/**
 * Unsubscribes the contact from the given sequences. Does not emit
 * `unsubscribedFromSequence` (see `addSequence`).
 */
export const removeSequence: TriggerActionHandler = async ({
  context,
  conversation,
}) => {
  const sequenceIds = parseSequenceIds(context.action, "removeSequence")
  if (!sequenceIds) {
    return skipped("invalidAction")
  }

  await contactSequenceService.unsubscribeContactForTrigger({
    workspaceId: context.workspaceId,
    contactId: conversation.contactId,
    sequenceIds,
  })
  return succeeded
}
