import { prisma } from "@ahachat.ai/database"
import { StepType, type FlowNode } from "@ahachat.ai/flow-config"
import { SdkException } from "@ahachat.ai/sdk"
import {
  ChatJobAction,
  chatQueue,
  type IntegrationJobSendFlow,
} from "@ahachat.ai/worker-config"

export const sendFlowNode = async (props: IntegrationJobSendFlow) => {
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: props.data.conversationId,
    },
  })
  if (!conversation) {
    throw new SdkException("Conversation not found")
  }

  const flow = await prisma.flow.findFirst({
    where: {
      chatbotId: conversation.chatbotId,
      id: props.data.flowId,
      active: true,
    },
  })
  if (!flow || !flow.currentVersionId) {
    throw new SdkException("Flow not valid")
  }

  const flowVersion = await prisma.flowVersion.findFirst({
    where: {
      id: flow.currentVersionId,
    },
  })
  if (!flowVersion) {
    throw new SdkException("FlowVersion not found")
  }

  // NOTES: process flow
  const startNode = (flowVersion.nodes as unknown as FlowNode[]).find(
    (n) => n.data.isStartNode,
  )
  if (!startNode) {
    throw new SdkException("FlowVersion does not contain start node")
  }

  for await (const stepResponse of runFlowNode(
    props.data.conversationId,
    startNode,
  )) {
    console.log(`Running: ${stepResponse}`)
  }
}

async function* runFlowNode(conversationId: string, node: FlowNode) {
  console.log("node.data.steps", node.data.steps)
  for (const step of node.data.steps) {
    switch (step.stepType) {
      case StepType.SendText:
      // case StepType.SendAudio:
      // case StepType.SendVideo:
      // case StepType.SendFile:
      // case StepType.SendGif:
      // case StepType.SendCard:
      // case StepType.SendCarousel:
      case StepType.SendImage: {
        chatQueue.add(ChatJobAction.SEND_FLOW_STEP, {
          type: ChatJobAction.SEND_FLOW_STEP,
          data: {
            conversationId,
            step,
          },
        })
        break
      }
    }
    yield step.stepType
  }
}
