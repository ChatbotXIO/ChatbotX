import { prisma } from "@aha.chat/database"
import { ButtonType, type FlowNode, StepType } from "@aha.chat/flow-config"
import { SdkException } from "@aha.chat/sdk"
import {
  IntegrationJobAction,
  type IntegrationJobSendFlowPostback,
  integrationQueue,
} from "@aha.chat/worker-config"

export async function sendFlowPostback(
  data: IntegrationJobSendFlowPostback["data"],
) {
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: data.conversationId,
    },
  })
  if (!conversation) {
    throw new SdkException("Conversation not found")
  }

  const flowVersion = await prisma.flowVersion.findFirst({
    where: {
      id: data.flowVersionId,
      chatbotId: conversation.chatbotId,
    },
  })
  if (!flowVersion) {
    throw new SdkException("FlowVersion not found")
  }

  const nodes = flowVersion.nodes as unknown as FlowNode[]
  const foundedButton = nodes
    .flatMap((n) => n.data.steps)
    .flatMap((s) => ("buttons" in s ? s.buttons : []))
    .find((b) => b.id === data.buttonId)

  if (!foundedButton) {
    return
  }

  switch (foundedButton.buttonType) {
    case ButtonType.SendMessage: {
      if (
        foundedButton.steps[0] &&
        foundedButton.steps[0].stepType === StepType.startAnotherNode &&
        foundedButton.steps[0].nodeId
      ) {
        await integrationQueue.add(IntegrationJobAction.sendFlow, {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId: conversation.id,
            flowVersionId: flowVersion.id,
            nodeId: foundedButton.steps[0].nodeId,
          },
        })
      }
      break
    }
    default:
      break
  }
}
