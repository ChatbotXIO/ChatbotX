import { db, findOrFail } from "@aha.chat/database/client"
import { conversationModel } from "@aha.chat/database/schema"
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
  const conversation = await findOrFail<ConversationModel>(
    conversationModel,
    {
      id: props.conversationId,
    },
    "Conversation not found",
  )

  let flowVersion: FlowVersionModel | null | undefined = null
  if (props.flowVersionId) {
    flowVersion = await db.query.flowVersionModel.findFirst({
      where: {
        id: props.flowVersionId,
        chatbotId: conversation.chatbotId,
      },
    })
  } else if (props.flowId) {
    const flow = await db.query.flowModel.findFirst({
      where: {
        id: props.flowId,
        chatbotId: conversation.chatbotId,
        active: true,
      },
    })
    if (flow?.currentVersionId) {
      flowVersion = await db.query.flowVersionModel.findFirst({
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
