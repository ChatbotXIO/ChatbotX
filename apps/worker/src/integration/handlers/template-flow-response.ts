import {
  automatedResponseService,
  broadcastService,
  whatsappFlowResponseService,
} from "@chatbotx.io/business"
import type { FlowVersionModel } from "@chatbotx.io/database/types"
import {
  type BroadcastTemplateFlowToken,
  decodeTemplateFlowToken,
  encodeButtonPayload,
  type FlowStepTemplateFlowToken,
  findSendWaTemplateStep,
  type SendWaTemplateMessageStepSchema,
  splitWaTemplateStepButtons,
  TemplateFlowOrigin,
  type WaTemplateButtonParam,
  type WaTemplateParams,
} from "@chatbotx.io/flow-config"
import type { IntegrationJobCaptureTemplateFlowResponse } from "@chatbotx.io/worker-config"
import {
  detectConversationAndContactInbox,
  detectFlowVersion,
} from "../../lib/db"
import { logger } from "../../lib/logger"

type ResolvedTemplateFlowButton = {
  integrationWhatsappId?: string | null
  flowSourceId: string
  param: WaTemplateButtonParam
}

type ResolvedFlowStepTemplateFlowButton = ResolvedTemplateFlowButton & {
  step: SendWaTemplateMessageStepSchema
}

const resolveButtonParam = (
  params: WaTemplateParams | null | undefined,
  token: Pick<TemplateFlowToken, "buttonIndex" | "cardIndex">,
): WaTemplateButtonParam | null => {
  if (token.cardIndex !== undefined) {
    return (
      params?.carousel?.find((card) => card.card_index === token.cardIndex)
        ?.button?.[token.buttonIndex] ?? null
    )
  }

  return params?.button?.[token.buttonIndex] ?? null
}

const resolveFromBroadcast = async (
  token: BroadcastTemplateFlowToken,
  context: {
    workspaceId: string
    inboxId: string
  },
): Promise<ResolvedTemplateFlowButton | null> => {
  const broadcast = await broadcastService.findByIdForResponse({
    workspaceId: context.workspaceId,
    broadcastId: token.broadcastId,
    inboxId: context.inboxId,
  })
  if (!broadcast) {
    logger.warn(
      { workspaceId: context.workspaceId, broadcastId: token.broadcastId },
      "[template-flow-response] broadcast not found",
    )
    return null
  }

  const param = resolveButtonParam(broadcast.templateData, token)
  if (!(param?.sub_type === "flow" && param.flowSourceId)) {
    logger.warn(
      {
        workspaceId: context.workspaceId,
        broadcastId: token.broadcastId,
        buttonIndex: token.buttonIndex,
        cardIndex: token.cardIndex,
      },
      "[template-flow-response] broadcast FLOW button params not found",
    )
    return null
  }

  return {
    integrationWhatsappId: broadcast.integrationWhatsappId,
    flowSourceId: param.flowSourceId,
    param,
  }
}

const resolveFromFlowStep = async (
  token: FlowStepTemplateFlowToken,
  context: {
    workspaceId: string
    inboxId: string
  },
): Promise<ResolvedFlowStepTemplateFlowButton | null> => {
  let flowVersion: FlowVersionModel
  try {
    ;({ flowVersion } = await detectFlowVersion({
      flowId: token.flowId,
      flowVersionId: token.flowVersionId,
      workspaceId: context.workspaceId,
    }))
  } catch (error) {
    logger.warn(
      {
        error,
        workspaceId: context.workspaceId,
        flowId: token.flowId,
        flowVersionId: token.flowVersionId,
      },
      "[template-flow-response] flow version not found",
    )
    return null
  }

  const step = findSendWaTemplateStep(flowVersion.nodes, token.stepId)
  const param = resolveButtonParam(step?.template.params, token)
  if (!(param?.sub_type === "flow" && param.flowSourceId)) {
    logger.warn(
      {
        workspaceId: context.workspaceId,
        flowId: token.flowId,
        flowVersionId: token.flowVersionId,
        stepId: token.stepId,
        buttonIndex: token.buttonIndex,
        cardIndex: token.cardIndex,
      },
      "[template-flow-response] flow-step FLOW button params not found",
    )
    return null
  }

  return {
    flowSourceId: param.flowSourceId,
    param,
    step,
  }
}

const enqueueTemplateFlowContinuation = async (props: {
  token: FlowStepTemplateFlowToken
  conversation: { id: string }
  contactInbox: { id: string }
  messageId: string
  step: SendWaTemplateMessageStepSchema
}) => {
  const { flowCompleteButton } = splitWaTemplateStepButtons(props.step.buttons)
  if (!flowCompleteButton) {
    return
  }

  const postback = encodeButtonPayload({
    flowId: props.token.flowId,
    flowVersionId: props.token.flowVersionId,
    buttonId: flowCompleteButton.id,
  })

  await automatedResponseService.enqueueFlowAction({
    kind: "postback",
    data: {
      conversationId: props.conversation,
      contactInboxId: props.contactInbox,
      action: postback,
      ref: null,
      messageId: props.messageId,
    },
  })
}

export async function captureTemplateFlowResponse(
  data: IntegrationJobCaptureTemplateFlowResponse["data"],
): Promise<void> {
  const token = decodeTemplateFlowToken(data.templateFlowToken)
  if (!token) {
    logger.warn(
      { workspaceId: data.workspaceId, messageId: data.messageId },
      "[template-flow-response] invalid token",
    )
    return
  }

  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId: data.conversationId,
      contactInboxId: data.contactInboxId,
    })

  if (conversation.workspaceId !== data.workspaceId) {
    logger.warn(
      {
        workspaceId: data.workspaceId,
        conversationWorkspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        messageId: data.messageId,
      },
      "[template-flow-response] workspace mismatch",
    )
    return
  }

  if (token.origin === TemplateFlowOrigin.Broadcast) {
    const resolved = await resolveFromBroadcast(token, {
      workspaceId: data.workspaceId,
      inboxId: contactInbox.inboxId,
    })
    if (!resolved) {
      return
    }

    await whatsappFlowResponseService.applyResponse({
      workspaceId: data.workspaceId,
      contactId: conversation.contactId,
      contactInbox,
      integrationWhatsappId: resolved.integrationWhatsappId,
      flowSourceId: resolved.flowSourceId,
      fieldMappings: resolved.param.fieldMappings ?? [],
      responseDumpFieldId: resolved.param.responseDumpFieldId ?? null,
      flowResponse: data.flowResponse,
    })
    return
  }

  const resolved = await resolveFromFlowStep(token, {
    workspaceId: data.workspaceId,
    inboxId: contactInbox.inboxId,
  })
  if (!resolved) {
    return
  }

  await whatsappFlowResponseService.applyResponse({
    workspaceId: data.workspaceId,
    contactId: conversation.contactId,
    contactInbox,
    flowSourceId: resolved.flowSourceId,
    fieldMappings: resolved.param.fieldMappings ?? [],
    responseDumpFieldId: resolved.param.responseDumpFieldId ?? null,
    flowResponse: data.flowResponse,
  })

  await enqueueTemplateFlowContinuation({
    token,
    conversation,
    contactInbox,
    messageId: data.messageId,
    step: resolved.step,
  })
}
