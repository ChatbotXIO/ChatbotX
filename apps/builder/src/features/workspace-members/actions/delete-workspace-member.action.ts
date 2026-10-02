"use server"

import {
  revokeWorkspaceMemberRealtimeConnections,
  workspaceMemberService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { logger } from "@/lib/log"
import { workspaceActionClientAllowExpired } from "@/lib/safe-action"

export const deleteWorkspaceMemberAction = workspaceActionClientAllowExpired
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
    } = props

    const workspaceMember = await workspaceMemberService.findByIdOrFail({
      id,
      workspaceId,
    })

    if (workspaceMember.role === "owner") {
      throw new ChatbotXException(
        "You cannot delete the owner of the workspace",
      )
    }

    const currentUserAndTargetChatbot =
      await getCurrentUserAndTargetWorkspace(workspaceId)
    if (!currentUserAndTargetChatbot) {
      throw new ChatbotXException(
        "You are not authorized to delete this workspace member",
      )
    }

    const permissions =
      currentUserAndTargetChatbot.targetWorkspaceMember.permissions
    if (!hasWorkspacePermission(permissions, "superAdmin")) {
      throw new ChatbotXException(
        "You are not authorized to delete this workspace member. You need to be a super admin to do this.",
      )
    }

    await workspaceMemberService.delete({ id, workspaceId })

    // The removed member's cached `listByUserId` result still lists this
    // workspace; bust it so their access is revoked immediately.
    await workspaceMemberService.invalidateMembershipCache(
      workspaceMember.userId,
    )

    // Close any realtime sockets the removed member already has open in
    // this workspace room — their next connect attempt is rejected anyway
    // (the mint endpoint re-checks membership), but an existing socket
    // would otherwise keep receiving events until it happens to reconnect.
    // `revokeWorkspaceMemberRealtimeConnections` already retries a transient
    // Redis failure a few times; if every attempt still fails, the removal
    // itself has already succeeded (the member is deleted and their session
    // re-check will reject the next connect) — only the IMMEDIATE socket
    // close is uncertain, so this reports a warning rather than failing the
    // whole action. See PR #1349 finding #5.
    let revokeWarning = false
    try {
      await revokeWorkspaceMemberRealtimeConnections({
        workspaceId,
        userId: workspaceMember.userId,
        reason: "deleted",
      })
    } catch (error) {
      revokeWarning = true
      logger.error(
        { err: error, userId: workspaceMember.userId, workspaceId },
        "Failed to revoke removed member realtime connections",
      )
    }

    return { revokeWarning }
  })
