"use server"

import { ChatbotMemberRole, type Prisma, prisma } from "@aha.chat/database"
import type {
  ChatbotMemberNotificationChannels,
  ChatbotMemberNotificationTypes,
} from "@aha.chat/database/types"
import { z } from "zod"
import { BaseException } from "@/lib/errors/exception"
import { authActionClient } from "@/lib/safe-action"

export const acceptInvitationAction = authActionClient
  .inputSchema(
    z.object({
      code: z.string(),
    }),
  )
  .action(async ({ ctx, parsedInput }) => {
    const { code } = parsedInput

    const invitation = await prisma.invitation.findUniqueOrThrow({
      where: { code },
    })

    if (invitation.expiresAt < new Date()) {
      throw new BaseException("Invitation expired")
    }

    if (invitation.chatbotId) {
      const existingMember = await prisma.chatbotMember.findFirst({
        where: {
          chatbotId: invitation.chatbotId,
          userId: ctx.user.id,
        },
      })
      if (existingMember) {
        throw new BaseException("You are already a member of this chatbot")
      }

      await prisma.chatbotMember.create({
        data: {
          chatbotId: invitation.chatbotId,
          userId: ctx.user.id,
          role: ChatbotMemberRole.agent,
          permissions: invitation.permissions as Prisma.InputJsonValue,
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
        },
      })
    } else {
      await prisma.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId: ctx.user.id,
          role: "member",
        },
      })
    }
  })
