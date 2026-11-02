import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import {
  IntegrationJobAction,
  type IntegrationJobRunFlowNode,
} from "@chatbotx.io/worker-config"

type SendFlowJobData = IntegrationJobRunFlowNode["data"]

type SendFlowCore = Pick<
  SendFlowJobData,
  "conversationId" | "contactInboxId" | "flowId" | "nodeId"
>

/**
 * Every field a caller may carry over from the run that started the flow
 * (metadata, sender, broadcast and trigger-message identity, ...). Optional, so
 * a trigger starts a flow with just the core and a flow step forwards all of it.
 */
type SendFlowExtras = Omit<SendFlowJobData, keyof SendFlowCore | "origin">

/** The one `sendFlow` job shape shared by every "start a flow / node" caller. */
export const buildSendFlowJob = (
  core: SendFlowCore,
  extras: SendFlowExtras = {},
): IntegrationJobRunFlowNode => ({
  type: IntegrationJobAction.sendFlow,
  data: { ...extras, ...core, origin: webhookChannelOrigin() },
})

type SendFlowExtrasSource = Pick<
  SendFlowExtras,
  | "metadata"
  | "isBulkBroadcast"
  | "appointmentId"
  | "sendFrom"
  | "sentByUserId"
  | "nodeVisits"
  | "triggerMessageId"
  | "triggerMessageCreatedAt"
  | "startedByContactMessage"
  | "commentAnchor"
>

/** What a flow step hands to the flow it starts, named explicitly. */
export const pickSendFlowExtras = (
  props: SendFlowExtrasSource,
): SendFlowExtras => ({
  metadata: props.metadata,
  isBulkBroadcast: props.isBulkBroadcast,
  appointmentId: props.appointmentId,
  sendFrom: props.sendFrom,
  sentByUserId: props.sentByUserId,
  nodeVisits: props.nodeVisits,
  triggerMessageId: props.triggerMessageId,
  triggerMessageCreatedAt: props.triggerMessageCreatedAt,
  startedByContactMessage: props.startedByContactMessage,
  commentAnchor: props.commentAnchor,
})
