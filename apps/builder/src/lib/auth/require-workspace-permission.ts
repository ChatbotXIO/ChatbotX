"use server"

import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { canAccessContactsSection } from "@/features/contacts/permissions"
import {
  hasWorkspacePermission,
  type WorkspacePermissionKey,
} from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

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
}

export async function requireContactsAccess(
  workspaceId: string,
): Promise<void> {
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  const canAccess = userAndWorkspace
    ? canAccessContactsSection(
        userAndWorkspace.targetWorkspaceMember.permissions,
      )
    : false

  if (!canAccess) {
    notFound()
  }
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
