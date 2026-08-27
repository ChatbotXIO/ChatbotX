"use server"

import { isDeepStrictEqual } from "node:util"
import {
  workspaceMemberCacheTag,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { workspaceMemberModel } from "@chatbotx.io/database/schema"
import { invalidateCacheByTags } from "@chatbotx.io/redis"
import { isCommunity } from "@/env"
import { workspaceIdAndIdRequestParams } from "@/features/common/schemas"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  getSuperAdminPermissions,
  normalizeContactsPermissions,
} from "../helpers"
import { updateWorkspaceMemberRequest } from "../schema/mutation"

export const updateWorkspaceMemberAction = workspaceActionClient
  .inputSchema(updateWorkspaceMemberRequest)
  .bindArgsSchemas(workspaceIdAndIdRequestParams)
  .action(async ({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) => {
    const workspaceMember = await findOrFail({
      table: workspaceMemberModel,
      where: { id, workspaceId },
      message: "Workspace member not found",
    })

    const currentUserAndTargetChatbot =
      await getCurrentUserAndTargetWorkspace(workspaceId)
    if (!currentUserAndTargetChatbot) {
      throw new ChatbotXException(
        "You are not authorized to update this workspace member",
      )
    }

    const permissions =
      currentUserAndTargetChatbot.targetWorkspaceMember.permissions
    if (!hasWorkspacePermission(permissions, "superAdmin")) {
      throw new ChatbotXException(
        "You are not authorized to update this workspace member. You need to be a super admin to do this.",
      )
    }

    // Role change guards (fork fibrazo): never leave the workspace ownerless.
    const nextRole = parsedInput.role
    if (nextRole && nextRole !== workspaceMember.role) {
      const members = await workspaceMemberService.listByWorkspaceId({
        workspaceId,
      })
      const ownerCount = members.filter((m) => m.role === "owner").length
      if (
        workspaceMember.role === "owner" &&
        nextRole === "agent" &&
        ownerCount <= 1
      ) {
        throw new ChatbotXException(
          "You cannot demote the last owner of the workspace",
        )
      }
    }

    const updateInput = isCommunity()
      ? {
          ...parsedInput,
          permissions: getSuperAdminPermissions(),
        }
      : {
          ...parsedInput,
          permissions: normalizeContactsPermissions(parsedInput.permissions),
        }

    const permissionsChanged = !isDeepStrictEqual(
      workspaceMember.permissions,
      updateInput.permissions,
    )
    const notificationsChanged = !(
      isDeepStrictEqual(
        workspaceMember.notificationTypes,
        updateInput.notificationTypes,
      ) &&
      isDeepStrictEqual(
        workspaceMember.notificationChannels,
        updateInput.notificationChannels,
      )
    )

    // updateWorkspaceMemberRequest currently has exactly these 3 fields, so
    // this covers every field in updateInput. If a new field is added to the
    // schema, it MUST be added to permissionsChanged/notificationsChanged (or
    // diffed separately) below, or it will silently never be persisted.
    if (!(permissionsChanged || notificationsChanged)) {
      return
    }

    const updated = await db
      .update(workspaceMemberModel)
      .set(updateInput)
      .where(eq(workspaceMemberModel.id, workspaceMember.id))
      .returning({ id: workspaceMemberModel.id })

    if (updated.length === 0) {
      return
    }

    // The member's permissions/nav are served from the cached
    // `listByUserId` result; bust it so the change takes effect immediately.
    await invalidateCacheByTags([
      workspaceMemberCacheTag(workspaceMember.userId),
    ])

    // Only a real permissions/role change is in the audit-log spec for this
    // action — a save that only touches notification settings must not be
    // recorded as a "changed role" event.
    if (permissionsChanged) {
      const targetUser = await db.query.userModel.findFirst({
        where: { id: workspaceMember.userId },
        columns: { name: true, email: true },
      })

      await auditService.record({
        action: "role_change",
        detail: `changed role of ${targetUser?.name ?? targetUser?.email ?? "a member"} to ${updateInput.permissions.superAdmin ? "admin" : "member"}`,
      })
    }
  })
