import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  contactInboxModel,
  conversationModel,
} from "@chatbotx.io/database/schema"
import type {
  ContactInboxModel,
  ConversationModel,
  FlowVersionModel,
} from "@chatbotx.io/database/types"
import { SdkException } from "@chatbotx.io/sdk"

export async function detectConversationAndContactInbox(props: {
  conversationId: string | ConversationModel
  contactInboxId: string | ContactInboxModel
}): Promise<{
  conversation: ConversationModel
  contactInbox: ContactInboxModel
}> {
  const conversation =
    typeof props.conversationId === "string"
      ? await findOrFail({
          table: conversationModel,
          where: {
            id: props.conversationId,
          },
          message: "Conversation not found",
        })
      : props.conversationId

  const contactInbox =
    typeof props.contactInboxId === "string"
      ? await findOrFail({
          table: contactInboxModel,
          where: {
            id: props.contactInboxId,
            contactId: conversation.contactId,
          },
          message: "Contact inbox not found",
        })
      : props.contactInboxId

  return {
    conversation,
    contactInbox,
  }
}

export async function detectFlowVersion(props: {
  flowId: string
  flowVersionId?: string
  workspaceId: string
}): Promise<{
  flowVersion: FlowVersionModel
  useLatestFlowVersion: boolean
}> {
  let flowVersion: FlowVersionModel | null | undefined = null
  if (props.flowVersionId) {
    flowVersion = await db.query.flowVersionModel.findFirst({
      where: {
        id: props.flowVersionId,
        workspaceId: props.workspaceId,
      },
    })
  } else if (props.flowId) {
    const flow = await db.query.flowModel.findFirst({
      where: {
        id: props.flowId,
        workspaceId: props.workspaceId,
        active: true,
      },
    })
    if (flow?.currentVersionId) {
      flowVersion = await db.query.flowVersionModel.findFirst({
        where: {
          id: flow.currentVersionId,
          workspaceId: props.workspaceId,
        },
      })
    }
  }

  if (!flowVersion) {
    throw new SdkException("FlowVersion not found")
  }

  return {
    flowVersion,
    useLatestFlowVersion: !props.flowVersionId,
  }
}
