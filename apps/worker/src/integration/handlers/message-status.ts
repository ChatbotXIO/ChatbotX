import { buildContext } from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import { emit } from "@chatbotx.io/event-bus"
import {
  type MetadataPayload,
  messageEventTypeSchema,
  UPDATE_STATUS_PAYLOAD_TYPE,
} from "@chatbotx.io/flow-config"
import { SdkException } from "@chatbotx.io/sdk"
import {
  IntegrationJobAction,
  type IntegrationJobMessageStatus,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import {
  allIntegrations,
  integrationService,
} from "../../services/integrations"
import { runFlowPostback } from "./flow"

export const handleMessageStatus = async (
  job: IntegrationJobMessageStatus["data"],
) => {
  const { integrationType, integrationIdentifier, payload } = job

  const dbIntegration =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      integrationType as IntegrationType,
      integrationIdentifier,
    )
  const { inbox, integrationRow } = dbIntegration
  const integration = allIntegrations[integrationType]
  if (!integration) {
    throw new SdkException(
      `No integration registered for channel: ${integrationType}`,
    )
  }

  const ctx = await buildContext({
    workspaceId: inbox.workspaceId,
    integrationType,
    integration: integrationRow,
  })

  const parsedMessage = await integration.runChannelHandler(
    "message",
    "handleMessageStatus",
    {
      ctx,
      data: job,
    },
  )

  if (!parsedMessage) {
    throw new SdkException("Unable to parse received message")
  }

  const { contact } = parsedMessage

  const eventStatus = String(payload.status).toLowerCase()

  try {
    const contactInbox = await db.query.contactInboxModel.findFirst({
      where: {
        sourceId: contact.sourceId,
        inboxId: inbox.id,
      },
      with: {
        conversation: true,
        contact: true,
      },
    })

    if (!contactInbox?.conversation) {
      throw new SdkException("Unable to find conversation")
    }

    const messageRepository = await createMessageRepository()
    const message = await messageRepository.findBySourceId(
      payload.messageId,
      contactInbox.conversation.id,
      inbox.workspaceId,
      getSafeSinceTime(contactInbox.lastMessageAt, 365 * 24 * 60 * 60 * 1000),
    )

    const eventLog = {
      context: {
        workspaceId: inbox.workspaceId,
        contactId: contactInbox.contact.id,
        conversationId: contactInbox.conversation.id,
        channel: inbox.channel,
        contactInboxId: contactInbox.id,
      },
      action: {
        messageId: message?.id,
        flowId: message?.contentAttributes?.flowId as string | undefined,
        flowVersionId: message?.contentAttributes?.flowVersionId as
          | string
          | undefined,
      },
      occurredAt: new Date(),
      nodeId: (message?.contentAttributes?.nodeId ?? "") as string,
      metadata: {
        type: UPDATE_STATUS_PAYLOAD_TYPE,
      } as MetadataPayload,
      errorData: {},
    }

    if (message?.contentAttributes?.metadata) {
      eventLog.metadata = message.contentAttributes.metadata as MetadataPayload
    }

    if (eventStatus === "delivered") {
      await emit(messageEventTypeSchema.enum["message:delivered"], eventLog)
    }

    if (eventStatus === "read") {
      await emit(messageEventTypeSchema.enum["message:seen"], eventLog)
    }

    if (eventStatus === "failed") {
      eventLog.errorData = payload.error ?? {}
      await emit(messageEventTypeSchema.enum["message:failed"], eventLog)
    }

    if (!message || (eventStatus !== "delivered" && eventStatus !== "failed")) {
      return
    }

    const contentAttributes = message.contentAttributes as {
      type?: string
      payload?: {
        buttons?: Array<{
          id: string
          label: string
          postback?: string
        }>
      }
      [key: string]: unknown
    }

    if (contentAttributes?.type !== "whatsapp_template") {
      return
    }

    const buttons = contentAttributes.payload?.buttons
    if (!(buttons && Array.isArray(buttons))) {
      return
    }

    const buttonLabel = eventStatus === "delivered" ? "Delivered" : "Failed"
    const button = buttons.find((b) => b.label === buttonLabel)
    if (!button?.postback) {
      return
    }

    await runFlowPostback({
      conversationId: message.conversationId,
      action: button.postback,
      ref: null,
      contactInboxId: contactInbox.id,
      webhookType: IntegrationJobAction.messageStatus,
    })
  } catch (error) {
    logger.error(
      error,
      `Error handling message status for messageId: ${payload.messageId}`,
    )
    throw error
  }
}
