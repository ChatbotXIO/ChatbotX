"use server"

import {
  isWorkspaceScheduledForDeletion,
  quotaEnforcementService,
  workspaceMemberService,
  workspaceService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, findOrFail } from "@chatbotx.io/database/client"
import { invitationModel } from "@chatbotx.io/database/schema"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { isCommunity } from "@/env"
import { getSuperAdminPermissions } from "@/features/workspace-members/helpers"
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

    if (!invitation.workspaceId) {
      throw new ChatbotXException("Invalid invitation: no workspace associated")
    }

    const existingMember = await db.query.workspaceMemberModel.findFirst({
      where: {
        workspaceId: invitation.workspaceId,
        userId: ctx.user.id,
      },
    })
    if (existingMember) {
      throw new ChatbotXException("You are already a member of this workspace")
    }

    const workspace = await workspaceService.find({
      where: { id: invitation.workspaceId },
    })
    if (workspace && isWorkspaceScheduledForDeletion(workspace)) {
      const t = await getTranslations("invitation")
      throw new ChatbotXException(
        t("workspaceUnavailable"),
        "workspaceScheduledDeletion",
        403,
      )
    }
    if (workspace) {
      const atLimit = await quotaEnforcementService.hasReachedLimit({
        userId: workspace.ownerId,
        metric: "teamMembers",
      })
      if (atLimit) {
        throw new ChatbotXException(
          "Team member limit reached for this workspace plan",
        )
      }
    }

    // Defense in depth: even though invite-time normalization is the source of
    // truth, re-force full super-admin permissions for community here so a row
    // written by any other path can't grant a restricted community member.
    const permissions = isCommunity()
      ? getSuperAdminPermissions()
      : invitation.permissions

    await workspaceMemberService.create({
      data: {
        id: createId(),
        workspaceId: invitation.workspaceId,
        userId: ctx.user.id,
        role: "agent",
        permissions,
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

    // The new membership must show up in the invitee's cached workspace list
    // right away; bust the tag so the workspace becomes reachable immediately.
    // Also bust the workspace-side member list so existing admins see the new
    // member without waiting for that cache's TTL to expire.
    await invalidateCacheByTags([
      `users:${ctx.user.id}:workspace-members`,
      `workspaces:${invitation.workspaceId}:workspace-members`,
    ])
  })
