import { isWorkspaceScheduledForDeletion } from "@chatbotx.io/business"
import { redirect } from "next/navigation"
import { getOriginUrlFromHeader } from "@/lib/domain"
import { WORKSPACE_DELETION_PENDING_PARAM } from "./deletion-pending-param"
import { workspaceSettingsGeneralPath } from "./settings-paths"

const safePathname = (originUrl: string): string => {
  if (!originUrl) {
    return ""
  }
  try {
    return new URL(originUrl).pathname
  } catch {
    // A malformed `x-url` must not throw inside a layout. An unknown path is
    // treated as "don't redirect" below.
    return ""
  }
}

export function enforceWorkspaceNotScheduledForDeletion(
  workspace: { id: string; scheduledDeletionAt: Date | string | null },
  pathname: string,
  canManageDeletion: boolean,
): void {
  if (!isWorkspaceScheduledForDeletion(workspace)) {
    return
  }

  // No self-redirect risk here: `/` never runs this enforcer, so a member who
  // cannot manage the deletion always leaves the workspace for good.
  if (!canManageDeletion) {
    redirect(`/?${WORKSPACE_DELETION_PENDING_PARAM}=1`)
  }

  // An unknown current path (missing or unparseable `x-url`) means we cannot
  // tell whether the redirect target IS the page being rendered. Redirecting
  // blind sends the client router into a refetch/redirect loop, so stay put —
  // the banner and the action-layer guards still hold the freeze, this hop is
  // only navigation UX.
  if (!pathname) {
    return
  }

  const settingsGeneralPath = workspaceSettingsGeneralPath(workspace.id)
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
  enforceWorkspaceNotScheduledForDeletion(
    workspace,
    safePathname(originUrl),
    canManageDeletion,
  )
}
