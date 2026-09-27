"use server"

import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import {
  buildContactPermissionScope,
  type ContactPermissionScope,
} from "@/features/contacts/permissions"
import {
  hasWorkspacePermission,
  type WorkspacePermissionKey,
} from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { enforceWorkspaceNotScheduledForDeletionFromRequest } from "@/lib/workspace/require-not-scheduled-for-deletion"

export async function requireWorkspacePermission(
  workspaceId: string,
  key: WorkspacePermissionKey,
): Promise<void> {
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  const canAccess = userAndWorkspace
    ? hasWorkspacePermission(
        userAndWorkspace.targetWorkspaceMember.permissions,
        key,
      )
    : false

  if (!canAccess) {
    notFound()
  }

  if (userAndWorkspace) {
    await enforceWorkspaceNotScheduledForDeletionFromRequest(
      userAndWorkspace.targetWorkspace,
      hasWorkspacePermission(
        userAndWorkspace.targetWorkspaceMember.permissions,
        "superAdmin",
      ),
    )
  }
}

export async function requireContactsAccess(
  workspaceId: string,
): Promise<ContactPermissionScope> {
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  const contactScope = userAndWorkspace
    ? buildContactPermissionScope({
        permissions: userAndWorkspace.targetWorkspaceMember.permissions,
        userId: userAndWorkspace.user.id,
      })
    : null

  if (!(userAndWorkspace && contactScope)) {
    notFound()
  }

  await enforceWorkspaceNotScheduledForDeletionFromRequest(
    userAndWorkspace.targetWorkspace,
    hasWorkspacePermission(
      userAndWorkspace.targetWorkspaceMember.permissions,
      "superAdmin",
    ),
  )

  return contactScope
}

export async function resolveGuardedWorkspaceId(
  params: Promise<{ workspaceId: string }>,
  key: WorkspacePermissionKey,
): Promise<string> {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    notFound()
  }
  await requireWorkspacePermission(workspaceId, key)
  return workspaceId
}
