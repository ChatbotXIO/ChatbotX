type WorkspaceScheduledDeletionState = {
  scheduledDeletionAt?: Date | string | null
}

type OwnerAccessState = {
  blocked: boolean
}

export type WorkspaceFreezeReason =
  | "missingWorkspace"
  | "ownerBlocked"
  | "scheduledForDeletion"

export const isWorkspaceScheduledForDeletion = (
  workspace: WorkspaceScheduledDeletionState,
): boolean => workspace.scheduledDeletionAt != null

/**
 * Single source of truth for "must this workspace's work be frozen right now".
 *
 * Every freeze layer (worker consumers, in-request webhook receivers, public
 * routes) resolves the reason here so the concept cannot drift into three
 * subtly different checks. Ordered most-terminal first: a purged row and a
 * pending deletion both outrank an entitlement block, because they are not
 * recoverable by paying.
 *
 * A missing workspace is FROZEN, not allowed: the row is only absent after the
 * purge cron hard-deleted it, so any work still referencing it belongs to a
 * workspace that no longer exists.
 *
 * `accessState` is optional so callers that have no owner entitlement in hand
 * (public routes) can reuse the deletion half of the check.
 */
export const resolveWorkspaceFreezeReason = (props: {
  accessState?: OwnerAccessState | null
  workspace?: WorkspaceScheduledDeletionState | null
}): WorkspaceFreezeReason | null => {
  if (!props.workspace) {
    return "missingWorkspace"
  }

  if (isWorkspaceScheduledForDeletion(props.workspace)) {
    return "scheduledForDeletion"
  }

  if (props.accessState?.blocked) {
    return "ownerBlocked"
  }

  return null
}
