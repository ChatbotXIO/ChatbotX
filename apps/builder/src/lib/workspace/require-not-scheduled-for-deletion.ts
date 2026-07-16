import { redirect } from "next/navigation"

export const WORKSPACE_DELETION_PENDING_PARAM = "workspaceDeletionPending"

export function enforceWorkspaceNotScheduledForDeletion(
  workspace: { id: string; scheduledDeletionAt: Date | string | null },
  pathname: string,
  canManageDeletion: boolean,
): void {
  if (!workspace.scheduledDeletionAt) {
    return
  }

  if (!canManageDeletion) {
    redirect(`/?${WORKSPACE_DELETION_PENDING_PARAM}=1`)
  }

  const settingsGeneralPath = `/space/${workspace.id}/settings/general`
  if (pathname.startsWith(settingsGeneralPath)) {
    return
  }

  redirect(settingsGeneralPath)
}
