import { channelPostShareService } from "@chatbotx.io/business"
import { ChannelPostShareRefusedError } from "@chatbotx.io/business/errors"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import {
  ChannelError,
  ChannelErrorCategory,
  isMessageChannelPostEntity,
} from "@chatbotx.io/sdk"

/**
 * A post share is checked when it is created, and again here when the queued
 * send runs: the post may have been removed, or its inbox's channel changed, in
 * between. A refusal is a permanent `PAYLOAD_INVALID` channel error, so the
 * send is not retried and is settled through the existing failed-outgoing rules
 * (a member's Inbox message keeps its error; any other is removed and logged).
 * A message that is not a post share is left alone.
 */
export const assertChannelPostStillSendable = async (props: {
  contentAttributes: Record<string, unknown> | null | undefined
  contactInbox: Pick<ContactInboxModel, "channel" | "inboxId">
  workspaceId: string
}): Promise<void> => {
  const { contentAttributes, contactInbox, workspaceId } = props
  if (!isMessageChannelPostEntity(contentAttributes)) {
    return
  }
  try {
    await channelPostShareService.resolveForSend({
      workspaceId,
      inboxId: contactInbox.inboxId,
      channel: contactInbox.channel,
      channelPostId: contentAttributes.channelPostId,
    })
  } catch (error) {
    if (error instanceof ChannelPostShareRefusedError) {
      throw new ChannelError(
        error.message,
        ChannelErrorCategory.PAYLOAD_INVALID,
        {
          code: error.reason,
        },
      )
    }
    throw error
  }
}
