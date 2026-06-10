import type {
  ContactInboxModel,
  ConversationModel,
  FlowVersionModel,
} from "@chatbotx.io/database/types"
import type {
  BaseStepSchema,
  EdgeSchema,
  MetadataPayload,
} from "@chatbotx.io/flow-config"
import type { Variables } from "@chatbotx.io/sdk"
import {
  type BotResponseTrackingContext,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"

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
  sendFrom?: "inbox"
}

export type ExecuteStepProps<T> = Omit<ExecuteMultipleStepsProps, "steps"> & {
  step: T
}

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
        sendFrom: props.sendFrom,
      },
    })
  }
}
