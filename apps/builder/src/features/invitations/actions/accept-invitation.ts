"use server"

import { ChatbotMemberRole, prisma } from "@aha.chat/database"
import type { InputJsonObject } from "node_modules/@aha.chat/database/src/generated/prisma/internal/prismaNamespace"
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
      await prisma.chatbotMember.create({
        data: {
          chatbotId: invitation.chatbotId,
          userId: ctx.user.id,
          role: ChatbotMemberRole.agent,
          permissions: invitation.permissions as InputJsonObject,
          notificationTypes: {
            notifyAdmin: true,
            newMessageToHuman: true,
            newOrder: true,
          },
          notificationChannels: {
            messenger: true,
            email: true,
            telegram: true,
            browser: true,
          },
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
