"use server"

import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, findOrFail } from "@chatbotx.io/database/client"
import {
  invitationModel,
  organizationMemberModel,
  workspaceMemberModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { authActionClient } from "@/lib/safe-action"
import { acceptInvitationRequest } from "../schema/accept-invitation"

export const acceptInvitationAction = authActionClient
  .inputSchema(acceptInvitationRequest)
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

    await db.transaction(async (tx) => {
      const existingOrgMember =
        await tx.query.organizationMemberModel.findFirst({
          where: {
            organizationId: invitation.organizationId,
            userId: ctx.user.id,
          },
        })
      if (!existingOrgMember) {
        await tx.insert(organizationMemberModel).values({
          id: createId(),
          organizationId: invitation.organizationId,
          userId: ctx.user.id,
          role: "agent",
        })
      }

      if (invitation.workspaceId) {
        const existingWorkspaceMember =
          await tx.query.workspaceMemberModel.findFirst({
            where: {
              workspaceId: invitation.workspaceId,
              userId: ctx.user.id,
            },
          })
        if (existingWorkspaceMember) {
          throw new ChatbotXException(
            "You are already a member of this workspace",
          )
        }

        await tx.insert(workspaceMemberModel).values({
          id: createId(),
          workspaceId: invitation.workspaceId,
          userId: ctx.user.id,
          role: invitation.role,
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
      }
    })
  })
