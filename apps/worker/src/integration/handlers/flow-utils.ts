import type {
  ContactInboxModel,
  ConversationModel,
  FlowVersionModel,
} from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import {
  type BaseStepSchema,
  type ButtonStepProps,
  type EdgeSchema,
  type MetadataPayload,
  type StepType,
  stepTypes,
} from "@chatbotx.io/flow-config"
import type { CommentAnchor, Variables } from "@chatbotx.io/sdk"
import {
  type BotResponseTrackingContext,
  ChatJobAction,
  type ChatJobSendFlowStep,
  chatQueue,
  IntegrationJobAction,
  integrationQueue,
  type NodeVisits,
} from "@chatbotx.io/worker-config"
import { waitForChatJobCompletion } from "../utils/message"

export type ExecuteMultipleStepsProps = {
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  flowVersion: FlowVersionModel
  useLatestFlowVersion?: boolean
  targetType?: "node" | "button" | "step" | "quickReply"
  targetId?: string
  targetNodeId?: string
  ctx?: {
    variables: Variables
  }
  steps: BaseStepSchema[]
  trackingContext?: BotResponseTrackingContext
  metadata?: MetadataPayload
  quickReplies?: ButtonStepProps[]
  sendFrom?: "inbox"
  nodeVisits?: NodeVisits
  triggerMessageId?: string
  triggerMessageCreatedAt?: Date
  commentAnchor?: CommentAnchor
  appointmentId?: string
}

export type ExecuteStepProps<T> = Omit<ExecuteMultipleStepsProps, "steps"> & {
  step: T
}

/**
 * Step types that actually send an outgoing message via `sendFlowMessage`
 * (see the `flowStepHandlers` map in `./step.ts` — keep this set in sync with
 * every entry mapped to `sendFlowMessage` there). Used to decide which step
 * "claims" a pending `commentAnchor` (comment-triggered private-reply flow) as
 * its first outgoing message.
 */
export const MESSAGE_PRODUCING_STEP_TYPES = new Set<StepType>([
  stepTypes.enum.sendText,
  stepTypes.enum.sendImage,
  stepTypes.enum.sendGif,
  stepTypes.enum.sendFile,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendAudio,
  stepTypes.enum.sendCard,
  stepTypes.enum.sendCarousel,
  stepTypes.enum.sendQuickReply,
  stepTypes.enum.sendWaTemplateMessage,
  stepTypes.enum.sendMessengerTemplateMessage,
  stepTypes.enum.whatsappOptionList,
  stepTypes.enum.whatsappFlow,
])

export type SuccessErrorStepSchema = BaseStepSchema & {
  successNodeId?: string
  errorNodeId?: string
}

export const seekConnectedNode = (
  flowVersion: FlowVersionModel,
  sourceId: string,
) => {
  const connectedNode = (flowVersion.edges as EdgeSchema[]).find(
    (edge) => edge.sourceHandle === sourceId,
  )
  return connectedNode?.target
}

export async function sendFlow(
  props: ExecuteStepProps<SuccessErrorStepSchema>,
  isSuccess: boolean,
) {
  const { conversation, contactInbox, flowVersion, step } = props
  if (!flowVersion) {
    return
  }

  const nodeId: string | undefined = isSuccess
    ? step.successNodeId
    : step.errorNodeId

  if (!nodeId) {
    return
  }

  const connectedNodeId = seekConnectedNode(flowVersion, nodeId)

  if (connectedNodeId) {
    await integrationQueue.add(IntegrationJobAction.sendFlow, {
      type: IntegrationJobAction.sendFlow,
      data: {
        conversationId: conversation,
        contactInboxId: contactInbox,
        flowId: flowVersion.flowId,
        nodeId: connectedNodeId,
        metadata: props.metadata,
        appointmentId: props.appointmentId,
        sendFrom: props.sendFrom,
        nodeVisits: props.nodeVisits,
        commentAnchor: props.commentAnchor,
        origin: webhookChannelOrigin(),
      },
    })
  }
}

/**
 * Enqueue a flow-step chat job and wait for completion to preserve the current
 * node's step ordering while using the analytics-aware flow send path.
 */
export async function enqueueFlowStepMessage(
  data: ChatJobSendFlowStep["data"],
): Promise<void> {
  const job = await chatQueue.add(ChatJobAction.sendFlowMessage, {
    type: ChatJobAction.sendFlowMessage,
    data,
  })

  await waitForChatJobCompletion(job, {
    conversationId: data.conversationId,
    stepId: data.step.id,
  })
}
