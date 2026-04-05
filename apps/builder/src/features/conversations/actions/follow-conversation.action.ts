"use server"

import { emitConversationFollowUp } from "@chatbotx/events"
import { conversationTrackingService } from "@chatbotx.io/analytics"
import { db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { workspaceActionClient } from "@/lib/safe-action"

export const followConversationAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      ctx,
    } = props

    await followConversation({ workspaceId, id, userId: ctx.user.id })
  })

export const followConversation = async (ctx: {
  workspaceId: string
  id: string
  userId: string
}) => {
  // Get conversation before updating to emit event
  const conversation = await db.query.conversationModel.findFirst({
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
    columns: {
      id: true,
      contactId: true,
      channel: true,
    },
  })

  if (!conversation) {
    throw new Error("Conversation not found")
  }

  await db
    .update(conversationModel)
    .set({
      followed: true,
    })
    .where(eq(conversationModel.id, ctx.id))

  try {
    await emitConversationFollowUp(
      ctx.workspaceId,
      conversation.contactId,
      conversation.id,
      ctx.userId,
    )
  } catch (error) {
    console.error("Failed to emit conversationFollowUp event:", error)
  }

  await conversationTrackingService.trackEvent(
    {
      workspaceId: ctx.workspaceId,
      conversationId: conversation.id,
      eventType: "conversation_followed",
      eventId: createId(),
      channel: "webchat", // TODO: replace correct channel from contact inbox
      occurredAt: new Date(),
      metadata: {
        triggerContext: {
          triggerSource: "api",
          triggerHandler: "followConversationAction",
          triggerType: "conversation_followed",
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
