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

type WorkspaceAccess = NonNullable<
  Awaited<ReturnType<typeof getCurrentUserAndTargetWorkspace>>
>

/**
 * 404s unless the current user is a member of the workspace holding `key`, and
 * returns that membership so a page does not look it up a second time.
 */
export async function requireWorkspacePermission(
  workspaceId: string,
  key: WorkspacePermissionKey,
): Promise<WorkspaceAccess> {
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (
    !(
      userAndWorkspace &&
      hasWorkspacePermission(
        userAndWorkspace.targetWorkspaceMember.permissions,
        key,
      )
    )
  ) {
    notFound()
  }

  await enforceWorkspaceNotScheduledForDeletionFromRequest(
    userAndWorkspace.targetWorkspace,
    hasWorkspacePermission(
      userAndWorkspace.targetWorkspaceMember.permissions,
      "superAdmin",
    ),
  )
  return userAndWorkspace
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
