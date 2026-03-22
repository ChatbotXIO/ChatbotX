"use server"

import { db, findOrFail } from "@aha.chat/database/client"
import {
  chatbotMemberModel,
  invitationModel,
  organizationMemberModel,
} from "@aha.chat/database/schema"
import type {
  ChatbotMemberNotificationChannels,
  ChatbotMemberNotificationTypes,
  InvitationModel,
} from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"
import { ChatbotXException } from "@/lib/errors/exception"
import { authActionClient } from "@/lib/safe-action"

export const acceptInvitationAction = authActionClient
  .inputSchema(
    z.object({
      code: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { code } = parsedInput

    const invitation = await findOrFail<InvitationModel>(
      invitationModel,
      {
        code,
      },
      "Invitation not found",
    )

    if (invitation.expiresAt < new Date()) {
      throw new ChatbotXException("Invitation expired")
    }

    if (invitation.chatbotId) {
      const existingMember = await db.query.chatbotMemberModel.findFirst({
        where: {
          chatbotId: invitation.chatbotId,
          userId: ctx.user.id,
        },
      })
      if (existingMember) {
        throw new ChatbotXException("You are already a member of this chatbot")
      }

      await db.insert(chatbotMemberModel).values({
        id: createId(),
        chatbotId: invitation.chatbotId,
        userId: ctx.user.id,
        role: "agent",
        permissions: invitation.permissions,
        notificationTypes: {
          notifyAdmin: true,
          newMessageToHuman: true,
          newOrder: true,
        } as ChatbotMemberNotificationTypes,
        notificationChannels: {
          messenger: true,
          email: true,
          telegram: true,
          browser: true,
        } as ChatbotMemberNotificationChannels,
      })
    } else {
      await db.insert(organizationMemberModel).values({
        id: createId(),
        organizationId: invitation.organizationId,
        userId: ctx.user.id,
        role: "member",
      })
    }
  })
