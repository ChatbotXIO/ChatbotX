import {
  broadcastService,
  whatsappFlowResponseService,
} from "@chatbotx.io/business"
import type { FlowVersionModel } from "@chatbotx.io/database/types"
import type { WaTemplateButtonParam } from "@chatbotx.io/flow-config"
import {
  type BroadcastTemplateFlowToken,
  decodeTemplateFlowToken,
  type FlowStepTemplateFlowToken,
  findSendWaTemplateStep,
  TemplateFlowOrigin,
  type TemplateFlowToken,
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

type TemplateFlowButtonResolver<TToken extends TemplateFlowToken> = (
  token: TToken,
  context: {
    workspaceId: string
  },
) => Promise<ResolvedTemplateFlowButton | null>

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

const resolveFromBroadcast: TemplateFlowButtonResolver<
  BroadcastTemplateFlowToken
> = async (token, context) => {
  const broadcast = await broadcastService.findByIdForResponse({
    workspaceId: context.workspaceId,
    broadcastId: token.broadcastId,
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

const resolveFromFlowStep: TemplateFlowButtonResolver<
  FlowStepTemplateFlowToken
> = async (token, context) => {
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
  }
}

const buttonParamResolvers = {
  [TemplateFlowOrigin.Broadcast]: resolveFromBroadcast,
  [TemplateFlowOrigin.FlowStep]: resolveFromFlowStep,
} satisfies {
  [Origin in TemplateFlowOrigin]: TemplateFlowButtonResolver<
    Extract<TemplateFlowToken, { origin: Origin }>
  >
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

  const resolver = buttonParamResolvers[
    token.origin
  ] as TemplateFlowButtonResolver<typeof token>
  const resolved = await resolver(token, { workspaceId: data.workspaceId })
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
    flowResponse: data.flowResponse,
  })
}
