import type { FlowVersionModel } from "@chatbotx.io/database/types"
import {
  type BroadcastTemplateFlowToken,
  decodeButtonPayload,
  decodeTemplateFlowToken,
  type FlowNode,
  type FlowStepTemplateFlowToken,
  findSendWaTemplateStep,
  findWhatsappFlowStepByButtonId,
  TemplateFlowOrigin,
  type TemplateFlowToken,
  type WaTemplateButtonParam,
  type WaTemplateParams,
} from "@chatbotx.io/flow-config"
import { broadcastService } from "../broadcast/service"
import { flowService } from "../flow/service"
import { flowVersionService } from "../flow-version/service"
import { logger } from "../logger"
import { whatsappFlowService } from "../whatsapp-flow/service"

export type ResolvedTemplateFlowButton = {
  integrationWhatsappId?: string | null
  flowSourceId: string
  param: WaTemplateButtonParam
}

type TemplateFlowButtonResolver<TToken extends TemplateFlowToken> = (
  token: TToken,
  context: {
    workspaceId: string
    /** The responding contact's inbox: a multi-page broadcast keeps its params per page. */
    inboxId: string
  },
) => Promise<ResolvedTemplateFlowButton | null>

/** The pinned version when the token names one, else the flow's current one. */
const findFlowVersion = async (props: {
  flowId: string
  flowVersionId?: string
  workspaceId: string
}): Promise<FlowVersionModel | undefined> => {
  if (props.flowVersionId) {
    return await flowVersionService.findByIdForWorkspace({
      versionId: props.flowVersionId,
      workspaceId: props.workspaceId,
    })
  }
  const flow = await flowService.findActiveById({
    id: props.flowId,
    workspaceId: props.workspaceId,
  })
  if (!flow?.currentVersionId) {
    return
  }
  return await flowVersionService.findByIdForWorkspace({
    versionId: flow.currentVersionId,
    workspaceId: props.workspaceId,
  })
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

const resolveFromBroadcast: TemplateFlowButtonResolver<
  BroadcastTemplateFlowToken
> = async (token, context) => {
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

const resolveFromFlowStep: TemplateFlowButtonResolver<
  FlowStepTemplateFlowToken
> = async (token, context) => {
  const flowVersion = await findFlowVersion({
    flowId: token.flowId,
    flowVersionId: token.flowVersionId,
    workspaceId: context.workspaceId,
  })
  if (!flowVersion) {
    logger.warn(
      {
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

/** The FLOW button of the template a template Flow token was sent from. */
export const resolveTemplateFlowButton = (
  token: TemplateFlowToken,
  context: { workspaceId: string; inboxId: string },
): Promise<ResolvedTemplateFlowButton | null> => {
  const resolver = buttonParamResolvers[
    token.origin
  ] as TemplateFlowButtonResolver<typeof token>
  return resolver(token, context)
}

export type SentWhatsappFlow = {
  flowSourceId: string
  integrationWhatsappId?: string | null
}

/** A "Send WhatsApp Flow" step's Flow; `flow.id` wins over a stale `sourceId`. */
const resolveFromWhatsappFlowStep = async (
  flowToken: string,
  workspaceId: string,
): Promise<SentWhatsappFlow | null> => {
  const payload = decodeButtonPayload(flowToken)
  if (!(payload?.flowId && payload.buttonId)) {
    return null
  }
  const flowVersion = await findFlowVersion({
    flowId: payload.flowId,
    flowVersionId: payload.flowVersionId,
    workspaceId,
  })
  if (!flowVersion) {
    return null
  }
  const step = findWhatsappFlowStepByButtonId(
    flowVersion.nodes as FlowNode[],
    payload.buttonId,
  )
  if (!step) {
    return null
  }
  const flowSourceId =
    (step.flow.id
      ? await whatsappFlowService.findSourceId({
          id: step.flow.id,
          workspaceId,
        })
      : undefined) || step.flow.sourceId
  return flowSourceId ? { flowSourceId } : null
}

/**
 * The WhatsApp Flow a response's `flow_token` was sent with. Meta's response
 * carries no Flow id, so the token is the only link: a "Send WhatsApp Flow"
 * step's button payload, or a template FLOW button's token. Null for a token
 * this workspace did not issue (e.g. a Flow sent outside ChatbotX).
 */
export const resolveSentWhatsappFlow = async (props: {
  workspaceId: string
  inboxId: string
  flowToken: string | null | undefined
}): Promise<SentWhatsappFlow | null> => {
  if (!props.flowToken) {
    return null
  }
  const templateToken = decodeTemplateFlowToken(props.flowToken)
  if (templateToken) {
    const resolved = await resolveTemplateFlowButton(templateToken, props)
    return resolved
      ? {
          flowSourceId: resolved.flowSourceId,
          integrationWhatsappId: resolved.integrationWhatsappId,
        }
      : null
  }
  return await resolveFromWhatsappFlowStep(props.flowToken, props.workspaceId)
}
