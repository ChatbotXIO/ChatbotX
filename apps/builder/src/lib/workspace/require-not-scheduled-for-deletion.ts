import { redirect } from "next/navigation"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { WORKSPACE_DELETION_PENDING_PARAM } from "./deletion-pending-param"

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

export async function enforceWorkspaceNotScheduledForDeletionFromRequest(
  workspace: { id: string; scheduledDeletionAt: Date | string | null },
  canManageDeletion: boolean,
): Promise<void> {
  const originUrl = await getOriginUrlFromHeader()
  const pathname = originUrl ? new URL(originUrl).pathname : ""
  enforceWorkspaceNotScheduledForDeletion(
    workspace,
    pathname,
    canManageDeletion,
  )
}
