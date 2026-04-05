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
  const conversation = await findOrFail({
    table: conversationModel,
    where: {
      id: props.conversationId,
    },
    message: "Conversation not found",
  })

  let flowVersion: FlowVersionModel | null | undefined = null
  if (props.flowVersionId) {
    flowVersion = await db.query.flowVersionModel.findFirst({
      where: {
        id: props.flowVersionId,
        workspaceId: conversation.workspaceId,
      },
    })
  } else if (props.flowId) {
    const flow = await db.query.flowModel.findFirst({
      where: {
        id: props.flowId,
        workspaceId: conversation.workspaceId,
        active: true,
      },
    })
    if (flow?.currentVersionId) {
      flowVersion = await db.query.flowVersionModel.findFirst({
        where: {
          id: flow.currentVersionId,
          workspaceId: conversation.workspaceId,
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
