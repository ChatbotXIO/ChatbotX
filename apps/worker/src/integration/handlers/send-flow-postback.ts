import { prisma } from "@aha.chat/database"
import type { FlowNode, StepType } from "@aha.chat/flow-config"
import { SdkException } from "@aha.chat/sdk"
import type {
  IntegrationJobSendFlowPostback,
  IntegrationJobSendFlowQuickReply,
} from "@aha.chat/worker-config"
import { generateRunFlowNode } from "./send-flow-node"
import { flowStepHandlers } from "./step-handler"

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
    .flatMap((n) =>
      "steps" in n.data.details && n.data.details.steps
        ? n.data.details.steps
        : [],
    )
    .flatMap((s) => ("buttons" in s ? s.buttons : []))
    .find((b) => b.id === data.buttonId)

  if (!foundedButton) {
    return
  }

  if (foundedButton.beforeStep) {
    await flowStepHandlers[foundedButton.beforeStep.stepType as StepType]?.({
      conversation,
      flowVersionId: flowVersion.id,
      step: foundedButton.beforeStep,
    })
  }

  if ("steps" in foundedButton && foundedButton.steps) {
    await generateRunFlowNode(conversation, flowVersion.id, foundedButton.steps)
  }
}

export async function sendFlowQuickReply(
  data: IntegrationJobSendFlowQuickReply["data"],
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
    .flatMap((n) =>
      "quickReplies" in n.data.details && n.data.details.quickReplies
        ? n.data.details.quickReplies
        : [],
    )
    .find((b) => b.id === data.buttonId)

  if (!foundedButton) {
    return
  }

  if (foundedButton.beforeStep) {
    await flowStepHandlers[foundedButton.beforeStep.stepType as StepType]?.({
      conversation,
      flowVersionId: flowVersion.id,
      step: foundedButton.beforeStep,
    })
  }

  if ("steps" in foundedButton && foundedButton.steps) {
    await generateRunFlowNode(conversation, flowVersion.id, foundedButton.steps)
  }
}
