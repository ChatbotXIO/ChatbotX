import { prisma } from "@aha.chat/database"
import type {
  ConversationModel,
  FlowVersionModel,
} from "@aha.chat/database/types"
import {
  type BaseStepSchema,
  type ButtonStepProps,
  type EdgeSchema,
  type FlowNode,
  type SendQuickReplyStepSchema,
  StepType,
} from "@aha.chat/flow-config"
import { SdkException } from "@aha.chat/sdk"
import type { IntegrationJobSendFlow } from "@aha.chat/worker-config"
import { flowStepHandlers } from "./step-handler"

export type RunFlowNodeProps = {
  conversation: ConversationModel
  flowVersion: FlowVersionModel
  useLatestFlowVersion?: boolean
  steps: BaseStepSchema[]
}

type RunStepsAndQuickRepliesProps = {
  conversation: ConversationModel
  flowVersion: FlowVersionModel
  useLatestFlowVersion?: boolean
  nodeDetail: {
    beforeStep?: BaseStepSchema | null
    steps?: BaseStepSchema[] | null
    quickReplies?: ButtonStepProps[] | null
  }
  nodeIdOrButtonId: string
  triggerNextNode?: boolean
}

export const sendFlowNode = async (props: IntegrationJobSendFlow) => {
  if (!(props.data.flowId || props.data.flowVersionId)) {
    throw new SdkException("Expect flowId or flowVersionId to sendFlowNode")
  }

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: props.data.conversationId,
    },
  })
  if (!conversation) {
    throw new SdkException("Conversation not found")
  }

  // Try to find corresponding flowVersion
  let flowVersion: FlowVersionModel | null = null
  if (props.data.flowVersionId) {
    flowVersion = await prisma.flowVersion.findFirst({
      where: {
        id: props.data.flowVersionId,
        chatbotId: conversation.chatbotId,
      },
    })
  } else {
    const flow = await prisma.flow.findFirst({
      where: {
        chatbotId: conversation.chatbotId,
        id: props.data.flowId,
        active: true,
      },
    })
    if (!flow?.currentVersionId) {
      throw new SdkException("Flow not valid")
    }

    flowVersion = await prisma.flowVersion.findFirst({
      where: {
        id: flow.currentVersionId,
      },
    })
  }
  if (!flowVersion) {
    throw new SdkException("FlowVersion not found")
  }

  // NOTES: process flow
  const startNode = (flowVersion.nodes as unknown as FlowNode[]).find((n) =>
    props.data.nodeId ? n.id === props.data.nodeId : n.data.isStartNode,
  )
  if (!startNode) {
    throw new SdkException("FlowVersion does not contain start node")
  }

  await runStepsAndQuickReplies({
    conversation,
    flowVersion,
    useLatestFlowVersion: !!props.data.flowVersionId,
    nodeDetail: startNode.data.details,
    nodeIdOrButtonId: startNode.id,
  })
}

export async function runStepsAndQuickReplies(
  props: RunStepsAndQuickRepliesProps,
) {
  const {
    conversation,
    flowVersion,
    useLatestFlowVersion,
    nodeDetail,
    nodeIdOrButtonId,
    triggerNextNode = true,
  } = props

  // run before step
  if (nodeDetail.beforeStep) {
    await generateRunFlowNode({
      conversation,
      flowVersion,
      useLatestFlowVersion,
      steps: [nodeDetail.beforeStep],
    })
  }

  await new Promise((resolve) => setTimeout(resolve, 200))

  // run steps
  if ("steps" in nodeDetail && nodeDetail.steps) {
    await generateRunFlowNode({
      conversation,
      flowVersion,
      useLatestFlowVersion,
      steps: nodeDetail.steps,
    })
  }

  await new Promise((resolve) => setTimeout(resolve, 200))

  if (
    "quickReplies" in nodeDetail &&
    nodeDetail.quickReplies &&
    nodeDetail.quickReplies.length > 0
  ) {
    await generateRunFlowNode({
      conversation,
      flowVersion,
      useLatestFlowVersion,
      steps: [
        {
          stepType: StepType.sendQuickReply,
          message: "Please select an option",
          buttons: nodeDetail.quickReplies,
        } as SendQuickReplyStepSchema,
      ],
    })
  }

  await new Promise((resolve) => setTimeout(resolve, 200))

  if (!triggerNextNode) {
    return
  }

  // send next node if exists
  const relatedEdge = (flowVersion.edges as EdgeSchema[]).find(
    (edge) => edge.sourceHandle === nodeIdOrButtonId,
  )

  if (relatedEdge) {
    const nextNode = (flowVersion.nodes as unknown as FlowNode[]).find(
      (node) => node.id === relatedEdge?.target,
    )
    if (nextNode) {
      await runStepsAndQuickReplies({
        conversation,
        flowVersion,
        useLatestFlowVersion,
        nodeDetail: nextNode.data.details,
        nodeIdOrButtonId: relatedEdge.target,
      })
    }
  }
}

export async function generateRunFlowNode(props: RunFlowNodeProps) {
  const gen = runFlowNode(props)
  let result = await gen.next()

  while (!result.done) {
    result = await gen.next()
  }
}

function* runFlowNode(props: RunFlowNodeProps) {
  const { conversation, flowVersion, useLatestFlowVersion, steps } = props

  for (const step of steps) {
    yield flowStepHandlers[step.stepType as StepType]?.({
      conversation,
      flowId: flowVersion.flowId,
      flowVersionId: useLatestFlowVersion ? undefined : flowVersion.id,
      step,
    })
  }
}
