type WorkspaceScheduledDeletionState = {
  scheduledDeletionAt?: Date | string | null
}

export const isWorkspaceScheduledForDeletion = (
  workspace: WorkspaceScheduledDeletionState,
): boolean => workspace.scheduledDeletionAt != null
