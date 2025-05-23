import { prisma } from "@ahachat.ai/database"
import { ButtonType, StepType, type FlowNode } from "@ahachat.ai/flow-config"
import { SdkException } from "@ahachat.ai/sdk"
import {
  IntegrationJobAction,
  integrationQueue,
  type IntegrationJobSendFlowPostback,
} from "@ahachat.ai/worker-config"

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
        foundedButton.steps[0].stepType === StepType.SEND_FLOW_NODE &&
        foundedButton.steps[0].nodeId
      ) {
        await integrationQueue.add(IntegrationJobAction.SEND_FLOW, {
          type: IntegrationJobAction.SEND_FLOW,
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
