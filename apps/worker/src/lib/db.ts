import { prisma } from "@aha.chat/database"
import type {
  ConversationModel,
  FlowVersionModel,
} from "@aha.chat/database/types"
import { SdkException } from "@aha.chat/sdk"

export async function findConversationAndFlowVersion(props: {
  conversationId: string
  flowId: string
  flowVersionId?: string
}): Promise<{
  conversation: ConversationModel
  flowVersion: FlowVersionModel
  useLatestFlowVersion: boolean
}> {
  const conversation = await prisma.conversation.findUnique({
    where: {
      id: props.conversationId,
    },
  })
  if (!conversation) {
    throw new SdkException("Conversation not found")
  }

  let flowVersion: FlowVersionModel | null = null
  if (props.flowVersionId) {
    flowVersion = await prisma.flowVersion.findFirst({
      where: {
        id: props.flowVersionId,
        chatbotId: conversation.chatbotId,
      },
    })
  } else if (props.flowId) {
    const flow = await prisma.flow.findFirst({
      where: {
        id: props.flowId,
        chatbotId: conversation.chatbotId,
        active: true,
      },
    })
    if (flow?.currentVersionId) {
      flowVersion = await prisma.flowVersion.findFirst({
        where: {
          id: flow.currentVersionId,
          chatbotId: conversation.chatbotId,
        },
      })
    }
  }

  if (!flowVersion) {
    throw new SdkException("FlowVersion not found")
  }

  return {
    conversation,
    flowVersion,
    useLatestFlowVersion: !props.flowVersionId,
  }
}
