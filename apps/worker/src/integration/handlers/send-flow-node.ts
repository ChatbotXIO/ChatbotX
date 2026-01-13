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
  StepType,
} from "@aha.chat/flow-config"
import { SdkException } from "@aha.chat/sdk"
import type { IntegrationJobSendFlow } from "@aha.chat/worker-config"
import { flowStepHandlers } from "./step-handler"

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

  await runStepsAndQuickReplies(
    conversation,
    flowVersion,
    startNode.data.details,
    startNode.id,
  )
}

export async function runStepsAndQuickReplies(
  conversation: ConversationModel,
  flowVersion: FlowVersionModel,
  flowDetail: {
    beforeStep?: BaseStepSchema | null
    steps?: BaseStepSchema[] | null
    quickReplies?: ButtonStepProps[] | null
  },
  nodeIdOrButtonId: string,
  triggerNextNode = true,
) {
  // run before step
  if (flowDetail.beforeStep) {
    await generateRunFlowNode(conversation, flowVersion, [
      flowDetail.beforeStep,
    ])
  }

  await new Promise((resolve) => setTimeout(resolve, 200))

  // run steps
  if ("steps" in flowDetail && flowDetail.steps) {
    await generateRunFlowNode(conversation, flowVersion, flowDetail.steps)
  }

  await new Promise((resolve) => setTimeout(resolve, 200))

  if (
    "quickReplies" in flowDetail &&
    flowDetail.quickReplies &&
    flowDetail.quickReplies.length > 0
  ) {
    await flowStepHandlers[StepType.sendQuickReply]?.({
      conversation,
      flowId: flowVersion.flowId,
      flowVersionId: flowVersion.id,
      step: {
        stepType: StepType.sendQuickReply,
        message: "Please select an option",
        buttons: flowDetail.quickReplies,
      },
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
      await runStepsAndQuickReplies(
        conversation,
        flowVersion,
        nextNode.data.details,
        relatedEdge.target,
      )
    }
  }
}

export async function generateRunFlowNode(
  conversation: ConversationModel,
  flowVersion: FlowVersionModel,
  steps: BaseStepSchema[],
) {
  const gen = runFlowNode({
    conversation,
    flowId: flowVersion.flowId,
    flowVersionId: flowVersion.id,
    steps,
  })
  let result = await gen.next()

  while (!result.done) {
    result = await gen.next()
  }
}

function* runFlowNode(props: {
  conversation: ConversationModel
  flowId: string
  flowVersionId: string
  steps: BaseStepSchema[]
}) {
  for (const step of props.steps) {
    yield flowStepHandlers[step.stepType as StepType]?.({
      conversation: props.conversation,
      flowId: props.flowId,
      flowVersionId: props.flowVersionId,
      step,
    })
  }
}
