import type { WorkspaceModel } from "@chatbotx.io/database/types"

/**
 * Owner opt-in check. True while `Workspace.supportAccessUntil` is set and
 * in the future — the window the owner enabled via Settings → General. This
 * is the sole gate for platform support access: a super admin is granted a
 * synthetic membership for the workspace whenever this is true, with no
 * separate grant/revoke row. See docs/support-access.md.
 */
export function isSupportAccessEnabled(
  workspace: Pick<WorkspaceModel, "supportAccessUntil">,
): boolean {
  return (
    !!workspace.supportAccessUntil && workspace.supportAccessUntil > new Date()
  )
}
