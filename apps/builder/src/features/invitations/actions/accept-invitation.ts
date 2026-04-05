"use server"

import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  invitationModel,
  organizationMemberModel,
  workspaceMemberModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
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

    const invitation = await findOrFail({
      table: invitationModel,
      where: {
        code,
      },
      message: "Invitation not found",
    })

    if (invitation.expiresAt < new Date()) {
      throw new ChatbotXException("Invitation expired")
    }

    if (invitation.workspaceId) {
      const existingMember = await db.query.workspaceMemberModel.findFirst({
        where: {
          workspaceId: invitation.workspaceId,
          userId: ctx.user.id,
        },
      })
      if (existingMember) {
        throw new ChatbotXException(
          "You are already a member of this workspace",
        )
      }

      await db.insert(workspaceMemberModel).values({
        id: createId(),
        workspaceId: invitation.workspaceId,
        userId: ctx.user.id,
        role: "agent",
        permissions: invitation.permissions,
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
