import { db, eq } from "@chatbotx.io/database/client"
import { messageModel, whatsappFlowModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import {
  type MetadataPayload,
  messageEventTypeSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  ChannelError,
  parseSdkError,
  type SendFlowStepData,
} from "@chatbotx.io/sdk"
import type {
  ChatJobSendChannelMessage,
  ChatJobSendTyping,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import {
  allIntegrations,
  resolveIntegrationContextFromContactInbox,
} from "../../services/integrations"

export async function sendMessageToChannel(
  data: ChatJobSendChannelMessage["data"],
) {
  const { conversation, contactInbox, message, metadata, sendFrom } = data

  try {
    const { integration, ctx } =
      await resolveIntegrationContextFromContactInbox({
        workspaceId: conversation.workspaceId,
        contactInbox,
      })

    await integration.runChannelHandler("message", "sendMessage", {
      ctx,
      data: {
        contact: contactInbox,
        message,
        metadata,
        sendFrom,
      },
    })
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
    await emit(messageEventTypeSchema.enum["message:failed"], {
      context: {
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        conversationId: conversation.id,
        channel: contactInbox.channel,
        contactInboxId: contactInbox.id,
      },
      action: {
        messageId: message?.id ?? "",
      },
      errorData: await parseSdkError(error),
      occurredAt: new Date(),
      metadata,
    })
    if (error instanceof ChannelError && !error.isRetryable) {
      return
    }
    throw error
  }
}

export async function sendTypingToChannel(data: ChatJobSendTyping["data"]) {
  const { conversation, contactInbox, typing, seconds } = data

  if (!allIntegrations[contactInbox.channel]) {
    // Typing is best-effort; missing integration is logged but not fatal.
    logger.debug(
      `No integration registered for typing on channel: ${contactInbox.channel}`,
    )
    return
  }

  const { integration, ctx } = await resolveIntegrationContextFromContactInbox({
    workspaceId: conversation.workspaceId,
    contactInbox,
  })

  await integration.runChannelHandler("conversation", "sendTyping", {
    ctx,
    data: { contact: contactInbox, typing, seconds },
  })
}

async function updateMessageSourceId(
  messageId: string | undefined,
  result: { messageIds: string[] },
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

export async function sendFlowStepToChannel({
  conversation,
  contactInbox,
  flowId,
  flowVersionId,
  step,
  metadata,
  messageId,
  sendFrom,
}: {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  flowId: string
  flowVersionId?: string
  step: SendFlowStepData
  metadata?: MetadataPayload
  messageId?: string
  sendFrom?: "inbox"
}): Promise<{ messageIds: string[] }> {
  const { integration, ctx } = await resolveIntegrationContextFromContactInbox({
    workspaceId: conversation.workspaceId,
    contactInbox,
  })

  let resolvedStep: SendFlowStepData = step

  if (
    step.stepType === stepTypes.enum.whatsappFlow &&
    step.flow.id &&
    !step.flow.sourceId
  ) {
    const [row] = await db
      .select({ sourceId: whatsappFlowModel.sourceId })
      .from(whatsappFlowModel)
      .where(eq(whatsappFlowModel.id, step.flow.id))
      .limit(1)

    if (row?.sourceId) {
      resolvedStep = {
        ...step,
        flow: { ...step.flow, sourceId: row.sourceId },
      }
    }
  }

  const result = await integration.runChannelHandler(
    "message",
    "sendFlowStep",
    {
      ctx,
      data: {
        contact: contactInbox,
        flowId,
        flowVersionId,
        step: resolvedStep,
        metadata,
        sendFrom,
      },
    },
  )

  await updateMessageSourceId(messageId, result)

  return result
}
