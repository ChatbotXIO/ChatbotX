import { prisma } from "@aha.chat/database"
import type {
  ConversationModel,
  FlowVersionModel,
} from "@aha.chat/database/types"
import { type FlowNode, StepType } from "@aha.chat/flow-config"
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

  if ("steps" in startNode.data.details && startNode.data.details.steps) {
    await generateRunFlowNode(
      conversation,
      flowVersion.id,
      startNode.data.details.steps,
    )
  }

  await new Promise((resolve) => setTimeout(resolve, 1000))

  if (
    "quickReplies" in startNode.data.details &&
    startNode.data.details.quickReplies.length > 0
  ) {
    await flowStepHandlers[StepType.sendQuickReply]?.({
      conversation,
      flowVersionId: flowVersion.id,
      step: {
        stepType: StepType.sendQuickReply,
        message: "Please select an option",
        buttons: startNode.data.details.quickReplies,
      },
    })
  }
}

export async function generateRunFlowNode(
  conversation: ConversationModel,
  flowVersionId: string,
  // biome-ignore lint/suspicious/noExplicitAny: wip
  steps: any[],
) {
  const gen = runFlowNode(conversation, flowVersionId, steps)
  let result = await gen.next()

  while (!result.done) {
    result = await gen.next()
  }
}

function* runFlowNode(
  conversation: ConversationModel,
  flowVersionId: string,
  // biome-ignore lint/suspicious/noExplicitAny: wip
  steps: any[],
) {
  for (const step of steps) {
    yield flowStepHandlers[step.stepType as StepType]?.({
      conversation,
      flowVersionId,
      step,
    })
  }
}
