/** Sync history of a workspace: every run, newest first. */
export const contactSyncHistoryPath = (workspaceId: string) =>
  `/space/${workspaceId}/contacts/sync/histories`

/** One run of the sync history, with its live progress. */
export const contactSyncRunPath = (workspaceId: string, runId: string) =>
  `${contactSyncHistoryPath(workspaceId)}/${runId}`
