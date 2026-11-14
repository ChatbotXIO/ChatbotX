import { contactInboxService } from "@chatbotx.io/business/contact-inbox"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import { type IncomingMessage, messageTypes } from "@chatbotx.io/sdk"
import {
  CHANNEL_BLOCK_STATE_CHANNELS,
  type ChannelType,
} from "@chatbotx.io/utils/channel"
import { logger } from "../../lib/logger"

/**
 * A contact who messages the account is following it, so a block recorded
 * from an unfollow webhook no longer holds. The follow webhook that should
 * have cleared it can be lost (a failed job, a non-2xx answer LINE gave up
 * on); without this, every reply to the contact fails as USER_BLOCKED and
 * broadcasts skip them until they unfollow and follow again.
 *
 * Goes through `setChannelBlocked`, so the ordering guard still applies: an
 * unfollow newer than this message wins. `occurredAt` should be the channel's
 * own event time; without one the processing time stands in.
 *
 * Best effort: a failure is logged and the inbound message is still ingested.
 */
export const clearChannelBlockOnInbound = async (props: {
  workspaceId: string
  contactInbox: Pick<
    ContactInboxModel,
    "inboxId" | "sourceId" | "channel" | "channelBlockedAt"
  >
  message: Pick<IncomingMessage, "messageType"> | null | undefined
  occurredAt?: Date | null
}): Promise<void> => {
  const { workspaceId, contactInbox, message, occurredAt } = props
  if (
    !contactInbox.channelBlockedAt ||
    message?.messageType !== messageTypes.enum.incoming ||
    !CHANNEL_BLOCK_STATE_CHANNELS.has(contactInbox.channel as ChannelType)
  ) {
    return
  }
  try {
    await contactInboxService.setChannelBlocked({
      workspaceId,
      inboxId: contactInbox.inboxId,
      sourceId: contactInbox.sourceId,
      blocked: false,
      occurredAt: occurredAt ?? new Date(),
    })
  } catch (error) {
    logger.error(
      { err: error, workspaceId, inboxId: contactInbox.inboxId },
      "Failed to clear the channel block for an inbound contact message",
    )
  }
}
