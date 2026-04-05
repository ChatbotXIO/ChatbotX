"use server"

import { conversationTrackingService } from "@chatbotx.io/analytics"
import { and, db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
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
    columns: {
      id: true,
      channel: true,
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

  await conversationTrackingService.trackEvent(
    {
      workspaceId: ctx.workspaceId,
      conversationId: conversation.id,
      eventType: "conversation_unfollowed",
      eventId: createId(),
      channel: "webchat", // TODO: replace correct channel from contact inbox
      occurredAt: new Date(),
      metadata: {
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "unfollowConversationAction",
          triggerType: "conversation_unfollowed",
        },
      },
    },
    { skipSpooler: true },
  )

  revalidateCacheTags([
    `workspaces:${ctx.workspaceId}#contacts`,
    `workspaces:${ctx.workspaceId}#conversations`,
  ])
}
