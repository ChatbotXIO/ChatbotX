"use server"

import { and, db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const unfollowConversationAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    await unfollowConversation({ workspaceId, id })
  })

export const unfollowConversation = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const conversation = await db.query.conversationModel.findFirst({
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    with: {
      contactInboxes: true,
    },
  })

  if (!conversation) {
    throw new Error("Conversation not found")
  }

  await db
    .update(conversationModel)
    .set({
      followed: false,
    })
    .where(
      and(
        eq(conversationModel.id, ctx.id),
        eq(conversationModel.workspaceId, ctx.workspaceId),
      ),
    )

  for (const contactInbox of conversation.contactInboxes) {
    emit("analytics:dashboard", {
      eventType: "conversation:unfollowed",
      workspaceId: ctx.workspaceId,
      conversationId: conversation.id,
      channel: contactInbox.channel,
      occurredAt: new Date(),
      metadata: {
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "unfollowConversationAction",
          triggerType: "conversation_unfollowed",
        },
      },
    }).catch((error) => {
      console.error("[unfollowConversation] Failed to emit", error)
    })
  }

  revalidateCacheTags([
    `workspaces:${ctx.workspaceId}#contacts`,
    `workspaces:${ctx.workspaceId}#conversations`,
  ])
}
