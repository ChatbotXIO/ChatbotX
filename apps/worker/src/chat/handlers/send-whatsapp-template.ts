import {
  broadcastToWorkspaceParty,
  contactInboxService,
  conversationService,
} from "@chatbotx.io/business"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import type { messageModel } from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { emit } from "@chatbotx.io/event-bus"
import type { MetadataPayload } from "@chatbotx.io/flow-config"
import {
  bindWaTemplateQuickReplyButtons,
  extractTemplateParams,
  messageEventTypeSchema,
  type SendWaTemplateMessageStepSchema,
  stepTypes,
  type TemplateComponent,
} from "@chatbotx.io/flow-config"
import { RealtimeEventType } from "@chatbotx.io/partysocket-config"
import {
  ChannelError,
  ChannelErrorCategory,
  type MessageTemplateEntity,
  parseSdkError,
  shouldAddressBySourceUserId,
} from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { contactVariableService } from "@chatbotx.io/variables"
import type {
  BotResponseTrackingContext,
  ChatJobSendWhatsappTemplateMessage,
} from "@chatbotx.io/worker-config"
import {
  replaceWhatsappTemplateVariables,
  validateWhatsappTemplate,
} from "../../integration/handlers/wa-template-handler"
import { logger } from "../../lib/logger"
import { skipIfBroadcastNotSendable } from "../utils/broadcast-sendable-guard"
import {
  shouldSuppressRetryableChannelError,
  willSendRetry,
} from "../utils/retry"
import { enqueueTemplateSentEvaluation } from "./enqueue-template-sent-evaluation"
import { convertButtonsToTemplate } from "./send-flow-step"
import { sendFlowStepToChannel } from "./send-message"

// Meta rejects (error 131062) an authentication-category template sent to a
// Business-Scoped User ID (BSUID) recipient. Declared as data so the guard
// below stays a lookup, not a branch, and any future restricted category
// Meta adds is a one-line change.
const bsuidRestrictedTemplateCategories = new Set(["AUTHENTICATION"])

/**
 * Pre-send guard (D5 in the BSUID plan): a BSUID-keyed contact-inbox cannot
 * receive an authentication-category template. Meta would return error
 * 131062, but failing fast here — before any API call — avoids a wasted
 * round trip and gives the caller a typed, categorized error instead of a
 * raw provider error. The error-mapper's 131062 entry is the safety net for
 * any send path that bypasses this call site.
 */
const assertTemplateAllowedForContactInbox = (props: {
  contactInbox: ContactInboxModel
  templateCategory: string
}): void => {
  const { contactInbox, templateCategory } = props
  if (
    shouldAddressBySourceUserId(contactInbox) &&
    bsuidRestrictedTemplateCategories.has(templateCategory)
  ) {
    throw new ChannelError(
      `Cannot send a ${templateCategory} template to a Business-Scoped User ID recipient`,
      ChannelErrorCategory.PAYLOAD_INVALID,
      { code: 131_062 },
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
  /**
   * Whether a rethrow from here produces another `message:failed` for this same
   * send — a BullMQ attempt still in hand. Defaults to terminal: the flow-step
   * caller swallows the rethrow and never retries.
   */
  willRetryOnThrow?: boolean
}

export interface ProcessWhatsappTemplateResult {
  message: typeof messageModel.$inferSelect
  messageId: string
  providerMessageId?: string
}

type WaTemplateParams = SendWaTemplateMessageStepSchema["template"]["params"]

/**
 * Template quick-reply buttons route exactly like regular flow buttons: each
 * seeded step button already receives an encoded postback from
 * `convertButtonsToTemplate`. That same string becomes the quick_reply
 * component payload, so the value Meta echoes back in
 * `messages.button.payload` is the postback the flow-action handler routes.
 * Steps without a quick-reply tail (legacy flows, broadcasts) yield no
 * bindings and the params pass through untouched — no component is sent and
 * Meta's default (button text) applies.
 */
function withQuickReplyButtonParams(props: {
  params: WaTemplateParams
  components: TemplateComponent[]
  stepButtons: SendWaTemplateMessageStepSchema["buttons"]
  flowButtonTemplates: ReturnType<typeof convertButtonsToTemplate>
}): WaTemplateParams {
  const postbackByButtonId = new Map(
    props.flowButtonTemplates.map((button) => [button.id, button.postback]),
  )

  const quickReplyParams = bindWaTemplateQuickReplyButtons(
    props.components,
    props.stepButtons,
  ).flatMap(({ templateButtonIndex, stepButton }) => {
    const payload = postbackByButtonId.get(stepButton.id)
    return payload
      ? [
          {
            sub_type: "quick_reply" as const,
            index: templateButtonIndex,
            payload,
          },
        ]
      : []
  })

  if (quickReplyParams.length === 0) {
    return props.params
  }

  // Generated postbacks must win over quick-reply payloads persisted by the
  // old form at the same template index — otherwise the send-layer dedupe
  // keeps the legacy payload and the connected flow branch never routes.
  const boundIndexes = new Set(quickReplyParams.map((param) => param.index))
  const withoutBoundLegacyQuickReplies = (props.params.button ?? []).filter(
    (param) =>
      !(
        param?.sub_type === "quick_reply" &&
        typeof param.index === "number" &&
        boundIndexes.has(param.index)
      ),
  )

  return {
    ...props.params,
    button: [...withoutBoundLegacyQuickReplies, ...quickReplyParams],
  }
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
    willRetryOnThrow = false,
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

    assertTemplateAllowedForContactInbox({
      contactInbox,
      templateCategory: validated.template.category,
    })

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

    const flowButtons = flow?.buttons ?? []
    const flowButtonTemplates =
      flow && flowButtons.length > 0
        ? convertButtonsToTemplate({
            flowId: flow.id,
            flowVersionId: flow.versionId,
            buttons: flowButtons,
            metadata,
            contactInboxId: contactInbox.id,
          })
        : []

    const resolvedParams = withQuickReplyButtonParams({
      params: replacedParams,
      components: (validated.template.components as TemplateComponent[]) || [],
      stepButtons: flowButtons,
      flowButtonTemplates,
    })

    const contentAttributes = {
      type: "whatsapp_template",
      template: {
        name: template.name,
        language: template.language,
        id: template.id,
        params: resolvedParams,
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

    if (flowButtonTemplates.length > 0) {
      contentAttributes.payload = {
        templateType: "button",
        buttons: flowButtonTemplates,
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

    const trackingInvalidation =
      await conversationService.recordOutboundMessageActivity({
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        contactId: contactInbox.contactId,
        at: createdMessage.createdAt,
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
        // Send the variable-resolved params (plus injected quick-reply
        // payloads) to the channel. The raw `template.params` still holds
        // unresolved tokens like {{first_name}}; the integration builds the
        // Graph API payload verbatim and cannot resolve them, so the recipient
        // would otherwise receive literal tokens.
        template: { ...template, params: resolvedParams },
      },
      metadata,
      messageId: newMessage.id,
    })

    await enqueueTemplateSentEvaluation({
      workspaceId: conversation.workspaceId,
      channel: "whatsapp",
      integrationId: validated.inbox.integrationWhatsapp.id,
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
      willRetry: willSendRetry({
        error,
        channel: contactInbox.channel,
        willRetryOnThrow,
      }),
    })

    throw error
  }
}

export async function sendWhatsappTemplateMessage(
  data: ChatJobSendWhatsappTemplateMessage["data"],
  willRetryOnThrow = false,
): Promise<ProcessWhatsappTemplateResult | undefined> {
  const {
    conversation,
    templateId,
    broadcastId,
    templateData,
    contactInbox,
    metadata,
  } = data

  if (
    await skipIfBroadcastNotSendable({
      broadcastId,
      contactId: conversation.contactId,
      handler: "sendWhatsappTemplateMessage",
    })
  ) {
    return
  }

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
        willRetry: willSendRetry({
          error,
          channel: contactInbox.channel,
          willRetryOnThrow,
        }),
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
      willRetryOnThrow,
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
