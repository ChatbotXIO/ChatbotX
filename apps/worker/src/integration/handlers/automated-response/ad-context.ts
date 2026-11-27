import { contactReferralEventService } from "@chatbotx.io/business"
import {
  adCreativeFromTouch,
  buildAdContextPrompt,
  isAdContextCandidate,
  isAdContextFresh,
} from "@chatbotx.io/business/ads-conversion/ad-context-prompt"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../../../lib/logger"

/**
 * The "ad context" block for the AI Agent chat system prompt, or `null` when
 * the customer did not just come from a paid ad.
 *
 * Checked cheapest first so an organic customer costs nothing: the referral
 * test is in memory (a paid ad whose snapshot carries a headline, text or
 * link), only such a customer reads the touch log. The block is rendered from
 * the newest logged touch, never from the merged `ContactInbox.referral`: the
 * snapshot can keep an older ad's copy, or lag behind a touch that arrived out
 * of order, so only the touch row pairs the copy with its own time. A failure
 * here must never cost the customer their reply, so every error degrades to
 * "no block" (today's behaviour) and is logged.
 */
export async function resolveAdContextPrompt(input: {
  contactInbox: ContactInboxModel
  conversation: ConversationModel
  now?: Date
}): Promise<string | null> {
  const { contactInbox, conversation } = input

  if (!isAdContextCandidate(contactInbox.referral)) {
    return null
  }

  try {
    const latestTouch = await contactReferralEventService.findLatestMetaAdTouch(
      {
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        contactInboxId: contactInbox.id,
      },
    )

    if (
      !(
        latestTouch &&
        isAdContextFresh(latestTouch.occurredAt, input.now ?? new Date())
      )
    ) {
      return null
    }

    return buildAdContextPrompt(adCreativeFromTouch(latestTouch))
  } catch (error) {
    logger.warn(
      {
        err: normalizeError(error),
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        reason: "ad_context_unavailable",
      },
      "[automated-response] ad context unavailable",
    )
    return null
  }
}
