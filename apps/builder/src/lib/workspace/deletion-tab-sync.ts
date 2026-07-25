const WORKSPACE_DELETION_SYNC_KEY = "chatbotx:workspace-deletion-scheduled"

export type WorkspaceDeletionSyncPayload = {
  workspaceId: string
  scheduledAt: number
}

export function parseWorkspaceDeletionPayload(
  value: string | null,
): WorkspaceDeletionSyncPayload | null {
  if (!value) {
    return null
  }

  try {
    const payload = JSON.parse(value) as Partial<WorkspaceDeletionSyncPayload>
    if (typeof payload.workspaceId !== "string") {
      return null
    }
    return {
      workspaceId: payload.workspaceId,
      scheduledAt:
        typeof payload.scheduledAt === "number" ? payload.scheduledAt : 0,
    }
  } catch {
    return null
  }
}

export function readWorkspaceDeletionSync(): WorkspaceDeletionSyncPayload | null {
  try {
    return parseWorkspaceDeletionPayload(
      window.localStorage.getItem(WORKSPACE_DELETION_SYNC_KEY),
    )
  } catch {
    return null
  }
}

export function writeWorkspaceDeletionSync(workspaceId: string): void {
  try {
    window.localStorage.setItem(
      WORKSPACE_DELETION_SYNC_KEY,
      JSON.stringify({
        workspaceId,
        scheduledAt: Date.now(),
      } satisfies WorkspaceDeletionSyncPayload),
    )
  } catch {
    // Best-effort cross-tab navigation; server guards remain authoritative.
  }
}

export function clearWorkspaceDeletionSync(workspaceId: string): void {
  try {
    const payload = readWorkspaceDeletionSync()
    if (payload?.workspaceId === workspaceId) {
      window.localStorage.removeItem(WORKSPACE_DELETION_SYNC_KEY)
    }
  } catch {
    // Best-effort cross-tab state cleanup; server guards remain authoritative.
  }
}

export { WORKSPACE_DELETION_SYNC_KEY }
