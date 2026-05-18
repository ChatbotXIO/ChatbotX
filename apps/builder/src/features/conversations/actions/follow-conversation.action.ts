"use server"

import { db, eq } from "@chatbotx.io/database/client"
import { conversationModel } from "@chatbotx.io/database/schema"
import { emit } from "@chatbotx.io/event-bus"
import { emitConversationFollowUp } from "@chatbotx.io/events"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { revalidateCacheTags } from "@/lib/cache-helper"
import { logger } from "@/lib/log"
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
    logger.error({ err: error }, "Failed to emit conversationFollowUp event:")
  }

  emit("analytics:dashboard", {
    eventType: "conversation:followed",
    workspaceId: ctx.workspaceId,
    conversationId: conversation.id,
    channel: "webchat", // TODO: replace correct channel from contact inbox
    occurredAt: new Date(),
    metadata: {
      triggerContext: {
        triggerSource: "api",
        triggerHandler: "followConversationAction",
        triggerType: "conversation_followed",
      },
    },
  }).catch((error) => {
    logger.error({ err: error }, "[followConversation] Failed to emit")
  })

  revalidateCacheTags([
    `workspaces:${ctx.workspaceId}#contacts`,
    `workspaces:${ctx.workspaceId}#conversations`,
  ])
}
