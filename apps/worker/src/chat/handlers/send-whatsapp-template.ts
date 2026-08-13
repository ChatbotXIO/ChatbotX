import {
  broadcastToWorkspaceParty,
  contactInboxService,
} from "@chatbotx.io/business"
import { db, eq } from "@chatbotx.io/database/client"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import {
  conversationModel,
  type messageModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
import {
  extractTemplateParams,
  messageEventTypeSchema,
  type SendWaTemplateMessageStepSchema,
  stepTypes,
  type TemplateComponent,
} from "@chatbotx.io/flow-config"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import { type MessageTemplateEntity, parseSdkError } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { contactVariableService } from "@chatbotx.io/variables"
import type {
  BotResponseTrackingContext,
  ChatJobSendWhatsappTemplateMessage,
} from "@chatbotx.io/worker-config"
import {
  enqueueIntegrationJob,
  IntegrationJobAction,
} from "@chatbotx.io/worker-config"
import {
  replaceWhatsappTemplateVariables,
  validateWhatsappTemplate,
} from "../../integration/handlers/wa-template-handler"
import { logger } from "../../lib/logger"
import { shouldSuppressRetryableChannelError } from "../utils/retry"
import { convertButtonsToTemplate } from "./send-flow-step"
import { sendFlowStepToChannel } from "./send-message"

type EnqueueTemplateSentEvaluationInput = {
  workspaceId: string
  integrationWhatsappId: string
  contactInboxId: string
  templateId: string
  messageId: string
}

async function enqueueTemplateSentEvaluation(
  input: EnqueueTemplateSentEvaluationInput,
): Promise<void> {
  try {
    await enqueueIntegrationJob(
      {
        type: IntegrationJobAction.evaluateTemplateSent,
        data: {
          workspaceId: input.workspaceId,
          integrationWhatsappId: input.integrationWhatsappId,
          contactInboxId: input.contactInboxId,
          templateId: input.templateId,
        },
      },
      {
        jobId: `ads-conversion-evaluate-template-${input.messageId}`,
      },
    )
  } catch (err) {
    logger.warn(
      {
        err,
        workspaceId: input.workspaceId,
        integrationWhatsappId: input.integrationWhatsappId,
        contactInboxId: input.contactInboxId,
        templateId: input.templateId,
        messageId: input.messageId,
      },
      "Failed to enqueue ads conversion template-sent evaluation",
    )
  }
}

export interface ProcessWhatsappTemplateParams {
  broadcastId?: string
  contactInbox: ContactInboxModel
  conversation: ConversationModel
  flow?: {
    id: string
    versionId?: string
    buttons: SendWaTemplateMessageStepSchema["buttons"]
  }
  metadata?: MetadataPayload
  step?: SendWaTemplateMessageStepSchema
  template: SendWaTemplateMessageStepSchema["template"]
  trackingContext?: BotResponseTrackingContext
}

export interface ProcessWhatsappTemplateResult {
  message: typeof messageModel.$inferSelect
  messageId: string
  providerMessageId?: string
}

export async function processWhatsappTemplate(
  params: ProcessWhatsappTemplateParams,
): Promise<ProcessWhatsappTemplateResult> {
  const {
    conversation,
    contactInbox,
    template,
    broadcastId,
    flow,
    step,
    trackingContext,
    metadata,
  } = params

  const eventLogData = {
    context: {
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      conversationId: conversation.id,
      channel: contactInbox.channel,
      contactInboxId: contactInbox.id,
      inboxId: contactInbox.inboxId,
    },
    action: {
      flowId: flow?.id || "",
      flowVersionId: flow?.versionId || "",
    },
    stepId: step?.id || "",
    nodeId: step?.nodeId || "",
    metadata,
  }

  let newMessage: typeof messageModel.$inferSelect | null = null

  try {
    const validated = await validateWhatsappTemplate(
      template.id,
      contactInbox.inboxId,
    )
    if (!validated) {
      logger.error(
        { templateId: template.id, inboxId: contactInbox.inboxId },
        "Template validation failed - not approved or not found",
      )
      throw new Error(`Template validation failed: ${template.id}`)
    }

    const variables = await contactVariableService.getAll({
      contactId: conversation.contactId,
      contactInbox,
      conversation,
    })
    const replacedParams = await replaceWhatsappTemplateVariables({
      templateParams: template.params,
      variables,
      // Authoritative source for NAMED vs POSITIONAL placeholders, so the send
      // works even for broadcasts/flows saved before named-parameter support.
      components: (validated.template.components as TemplateComponent[]) || [],
    })

    const contentAttributes = {
      type: "whatsapp_template",
      template: {
        name: template.name,
        language: template.language,
        id: template.id,
        params: replacedParams,
      },
      stepId: step?.id,
      nodeId: step?.nodeId,
      ...(broadcastId && { broadcastId }),
      ...(flow && { flowId: flow.id }),
      ...(flow && { flowVersionId: flow.versionId }),
      ...(trackingContext && { trackingContext }),
      payload: {} as MessageTemplateEntity["payload"],
      metadata,
    }

    if (flow?.buttons && flow.buttons.length > 0) {
      contentAttributes.payload = {
        templateType: "button",
        buttons: convertButtonsToTemplate({
          flowId: flow.id,
          flowVersionId: flow.versionId,
          buttons: flow.buttons,
          contactInboxId: contactInbox.id,
        }),
      }
    }

    const repository = await createMessageRepository()
    newMessage = await repository.create({
      contactInboxId: contactInbox.id,
      workspaceId: conversation.workspaceId,
      conversationId: conversation.id,
      messageType: "outgoing",
      contentType: "text",
      senderType: "bot",
      sourceId: null,
      text: `Template: ${template.name}`,
      contentAttributes,
      createdAt: new Date(),
    })

    if (!newMessage) {
      throw new Error("Failed to insert message record")
    }
    const createdMessage = newMessage

    const trackingInvalidation = await db.transaction(async (tx) => {
      const invalidation =
        await contactInboxService.recordOutboundMessageCreated({
          tx,
          contactInboxId: contactInbox.id,
          contactId: contactInbox.contactId,
          workspaceId: conversation.workspaceId,
          at: createdMessage.createdAt,
        })

      await tx
        .update(conversationModel)
        .set({ lastActivityAt: createdMessage.createdAt })
        .where(eq(conversationModel.id, conversation.id))

      return invalidation
    })
    if (trackingInvalidation) {
      await contactInboxService.invalidateTracking(trackingInvalidation)
    }

    broadcastToWorkspaceParty(conversation.workspaceId, {
      eventType: RealtimeEventType.messageCreated,
      data: newMessage,
    })

    const result = await sendFlowStepToChannel({
      conversation,
      contactInbox,
      flowId: flow?.id || "",
      flowVersionId: flow?.versionId || "",
      step: {
        id: step?.id ?? createId(),
        nodeId: step?.nodeId ?? createId(),
        stepType: stepTypes.enum.sendWaTemplateMessage,
        buttons: [],
        // Send the variable-resolved params to the channel. The raw
        // `template.params` still holds unresolved tokens like {{first_name}};
        // the integration builds the Graph API payload verbatim and cannot
        // resolve them, so the recipient would otherwise receive literal tokens.
        template: { ...template, params: replacedParams },
      },
      metadata,
      messageId: newMessage.id,
    })

    await enqueueTemplateSentEvaluation({
      workspaceId: conversation.workspaceId,
      integrationWhatsappId: validated.inbox.integrationWhatsapp.id,
      contactInboxId: contactInbox.id,
      templateId: template.id,
      messageId: newMessage.id,
    })

    await emit(messageEventTypeSchema.enum["message:sent"], {
      ...eventLogData,
      action: { messageId: "", flowId: flow?.id || "" },
      occurredAt: new Date(),
    })

    // Bot-message quota accounting: `chat/worker.ts`'s pre-send gate blocks
    // `sendWhatsappTemplateMessage` jobs, but nothing previously counted a
    // successful send here — the quota gate and the quota meter must stay
    // structurally paired or the gate is enforced against a counter that
    // never moves.
    emit("analytics:dashboard", {
      eventType: "message:bot_sent",
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      senderType: "bot",
      occurredAt: new Date(),
      source: contactInbox.source,
      sourceId: contactInbox.sourceId,
      channel: contactInbox.channel,
      metadata: {
        triggerContext: {
          triggerSource: "worker",
          triggerHandler: "processWhatsappTemplate",
          triggerType: "message_bot_sent_whatsapp_template",
        },
      },
    })

    const providerMessageId = result?.messageIds?.[0]

    if (providerMessageId) {
      try {
        await repository.updateSourceId(
          newMessage.id,
          providerMessageId,
          conversation.workspaceId,
          newMessage.createdAt,
        )
      } catch (err) {
        logger.error(
          err,
          "Failed to persist WhatsApp template sourceId after a successful send",
        )
      }
    }

    return {
      messageId: newMessage.id,
      providerMessageId,
      message: { ...newMessage, sourceId: providerMessageId || null },
    }
  } catch (error) {
    const errorData = await parseSdkError(error)

    logger.error(
      {
        error,
        messageId: newMessage?.id,
        conversationId: conversation.id,
        templateId: template.id,
      },
      "Failed to send WhatsApp template to provider",
    )
    await emit(messageEventTypeSchema.enum["message:failed"], {
      ...eventLogData,
      action: {
        messageId: newMessage?.id || "",
        flowId: flow?.id || "",
      },
      errorData,
      occurredAt: new Date(),
    })

    throw error
  }
}

export async function sendWhatsappTemplateMessage(
  data: ChatJobSendWhatsappTemplateMessage["data"],
): Promise<ProcessWhatsappTemplateResult | undefined> {
  const {
    conversation,
    templateId,
    broadcastId,
    templateData,
    contactInbox,
    metadata,
  } = data

  const eventLogData = {
    context: {
      workspaceId: conversation.workspaceId,
      contactId: conversation.contactId,
      conversationId: conversation.id,
      channel: contactInbox.channel,
      contactInboxId: contactInbox.id,
      inboxId: contactInbox.inboxId,
    },
    action: {
      flowId: "",
    },
    stepId: "",
    nodeId: "",
    metadata,
  }

  try {
    const validated = await validateWhatsappTemplate(
      templateId,
      contactInbox.inboxId,
    )

    if (!validated) {
      const error = new Error(
        `WhatsApp template not found or not approved: ${templateId}`,
      )
      await emit(messageEventTypeSchema.enum["message:failed"], {
        ...eventLogData,
        action: { messageId: "", flowId: "" },
        errorData: await parseSdkError(error),
        occurredAt: new Date(),
      })
      throw error
    }

    const { template } = validated
    const templateParams =
      templateData ??
      extractTemplateParams((template.components as TemplateComponent[]) || [])

    const result = await processWhatsappTemplate({
      conversation,
      contactInbox,
      template: {
        id: template.id,
        name: template.name,
        language: template.language,
        params: templateParams,
      },
      broadcastId,
      metadata,
    })

    return result
  } catch (error) {
    logger.error(
      {
        error,
        conversationId: conversation.id,
        templateId,
        broadcastId,
      },
      "Error sending WhatsApp template message for broadcast",
    )
    if (shouldSuppressRetryableChannelError(error, contactInbox.channel)) {
      return
    }
    throw error
  }
}
