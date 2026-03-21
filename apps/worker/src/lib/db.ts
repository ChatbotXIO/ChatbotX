import { db, findOrFail } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import type {
  ConversationModel,
  FlowVersionModel,
} from "@chatbotx.io/database/types"
import { SdkException } from "@chatbotx.io/sdk"

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
