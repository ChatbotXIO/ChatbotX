import { prisma } from "@aha.chat/database"
import type { FlowNode } from "@aha.chat/flow-config"
import { SdkException } from "@aha.chat/sdk"
import type { IntegrationJobSendFlowRef } from "@aha.chat/worker-config"
import { generateRunFlowNode } from "./send-flow-node"

export async function sendFlowRef(data: IntegrationJobSendFlowRef["data"]) {
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: data.conversationId,
    },
  })
  if (!conversation) {
    throw new SdkException("Conversation not found")
  }

  if (!(data.ref.startsWith("r_") || data.ref.startsWith("f_"))) {
    throw new SdkException("Ref link format is invalid")
  }

  const ref = await prisma.refLink.findFirst({
    where: {
      id: data.ref.split("_")[1],
      chatbotId: conversation.chatbotId,
    },
  })
  if (!ref) {
    throw new SdkException("RefLink not found")
  }

  if (ref.fieldId) {
    await prisma.contactCustomField.upsert({
      where: {
        contactId_customFieldId: {
          contactId: data.contactId,
          customFieldId: ref.fieldId,
        },
      },
      create: {
        contactId: data.contactId,
        customFieldId: ref.fieldId,
        value: ref.name,
      },
      update: {
        value: ref.name,
      },
    })
  }

  const flowVersion = await prisma.flowVersion.findFirst({
    where: {
      flowId: ref.flowId,
      chatbotId: conversation.chatbotId,
      isDraft: false,
      isLatest: true,
    },
  })
  if (!flowVersion) {
    throw new SdkException("FlowVersion not found")
  }

  const startNode = (flowVersion.nodes as unknown as FlowNode[]).find(
    (n) => n.data.isStartNode,
  )
  if (
    startNode &&
    "steps" in startNode.data.details &&
    startNode.data.details.steps
  ) {
    await generateRunFlowNode(
      conversation,
      flowVersion.id,
      startNode.data.details.steps,
    )
  }
}
