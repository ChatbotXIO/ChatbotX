import { db, eq } from "@chatbotx.io/database/client"
import { messageModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { getStoragePrefix, uploader } from "@chatbotx.io/filesystem"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
import type {
  ChatJobSendExternalMessage,
  ChatJobSendTyping,
} from "@chatbotx.io/worker-config"
import { allIntegrations, integrationService } from "../../lib/integrations"
import { logger } from "../../lib/logger"

export async function sendMessageToExternal(
  data: ChatJobSendExternalMessage["data"],
) {
  const { conversation, contactInbox, message, metadata } = data

  // Find integration auth
  const auth =
    await integrationService.getIntegrationAuthFromContactInbox(contactInbox)

  // Find integration detail
  const integrationDetail = allIntegrations[contactInbox.channel]
  if (!integrationDetail) {
    logger.debug(
      `Does not support this integration for channel: ${contactInbox.channel}`,
    )
    return
  }

  await integrationDetail.channels?.channel?.message?.sendMessage?.({
    ctx: {
      storagePrefix: `public/workspaces/${conversation.workspaceId}/inboxes/${contactInbox.inboxId}`,
      uploader,
      auth,
    },
    data: {
      contact: contactInbox,
      message,
      metadata,
    },
  })
}

export async function sendTypingToExternal(data: ChatJobSendTyping["data"]) {
  const { conversation, contactInbox, typing, seconds } = data

  // Find integration auth
  const auth =
    await integrationService.getIntegrationAuthFromContactInbox(contactInbox)

  // Find integration detail
  const integrationDetail = allIntegrations[contactInbox.channel]
  if (!integrationDetail) {
    logger.debug(
      `Does not support this integration for channel: ${contactInbox.channel}`,
    )
    return
  }

  await integrationDetail.channels?.channel?.conversation?.sendTyping?.({
    ctx: {
      storagePrefix: getStoragePrefix(
        conversation.workspaceId,
        contactInbox.inboxId,
      ),
      auth,
    },
    data: { contact: contactInbox, typing, seconds },
  })
}

async function updateMessageSourceId(
  messageId: string | undefined,
  result: { messageIds?: string[] },
) {
  try {
    const firstMessageId = result?.messageIds?.[0]
    if (messageId && firstMessageId) {
      await db
        .update(messageModel)
        .set({ sourceId: firstMessageId })
        .where(eq(messageModel.id, messageId))
    }
  } catch (err) {
    logger.error(err, "Failed to update message sourceId with provider id")
  }
}

export async function sendFlowStepToExternal({
  conversation,
  contactInbox,
  flowId,
  flowVersionId,
  step,
  metadata,
  messageId,
}: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  flowId: string
  flowVersionId?: string
  step: SendFlowStepData
  metadata?: MetadataPayload
  messageId?: string
}): Promise<{ messageIds?: string[] }> {
  // Find integration auth
  const auth =
    await integrationService.getIntegrationAuthFromContactInbox(contactInbox)

  // Find integration detail
  const integrationDetail = allIntegrations[contactInbox.channel]
  if (!integrationDetail) {
    logger.error(
      `Unable to find integration detail for channel: ${contactInbox.channel}`,
    )
    return {}
  }

  const result =
    await integrationDetail.channels?.channel?.message?.sendFlowStep?.({
      ctx: {
        storagePrefix: getStoragePrefix(
          conversation.workspaceId,
          contactInbox.inboxId,
        ),
        auth,
      },
      data: {
        contact: contactInbox,
        flowId,
        flowVersionId,
        step,
        metadata,
      },
    })

  await updateMessageSourceId(messageId, result)

  return result || {}
}
