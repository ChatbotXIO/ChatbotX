import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { WorkspaceDeletionRequestState } from "@chatbotx.io/database/repositories/workspace"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { logger } from "../logger"
import {
  type ResourceDeletionTarget,
  resourceDeletionLogService,
} from "../resource-deletion-log/service"

/** The workspace row as read back by the purge's final delete. */
type DeletedWorkspace = Pick<
  WorkspaceModel,
  "id" | "name" | "deletionRequestedById" | "deletionRequestedAt"
>

export const workspaceDeletionTarget = (
  id: string,
  name?: string,
): ResourceDeletionTarget => ({
  type: "workspace",
  id,
  workspaceId: id,
  name,
})

/**
 * Closes the request a workspace currently has as `canceled`. A workspace
 * scheduled before the log existed has no row to close, so the request is
 * recovered from the workspace itself — with an unknown origin, because the
 * actor running now is not the one who made it.
 */
export async function closePreviousWorkspaceDeletionRequest(
  current: WorkspaceDeletionRequestState,
  tx: DatabaseClient,
): Promise<void> {
  const resource = workspaceDeletionTarget(current.id, current.name)
  const canceled = await resourceDeletionLogService.cancelPending({
    resource,
    tx,
  })
  if (canceled > 0 || !current.deletionRequestedAt) {
    return
  }
  await resourceDeletionLogService.recordHistoricalRequest({
    resource,
    status: "canceled",
    requestedByUserId: current.deletionRequestedById,
    requestedAt: current.deletionRequestedAt,
    tx,
  })
}

/**
 * Completes the workspace's deletion log row inside the transaction that
 * deletes the workspace, so it reads `completed` if and only if the workspace
 * is really gone. A workspace scheduled before the log existed has no pending
 * row; it is recorded as completed from what the workspace stored.
 */
export async function completeWorkspaceDeletionLog(props: {
  pendingLogId: string | undefined
  workspace: DeletedWorkspace
  tx: DatabaseClient
}): Promise<void> {
  const { pendingLogId, workspace, tx } = props
  if (!pendingLogId) {
    await resourceDeletionLogService.recordHistoricalRequest({
      resource: workspaceDeletionTarget(workspace.id, workspace.name),
      status: "completed",
      requestedByUserId: workspace.deletionRequestedById,
      requestedAt: workspace.deletionRequestedAt ?? new Date(),
      tx,
    })
    return
  }
  const completed = await resourceDeletionLogService.completePending({
    id: pendingLogId,
    tx,
  })
  if (completed === 0) {
    logger.warn(
      { workspaceId: workspace.id, pendingLogId },
      "workspace-purge: deletion log row was no longer pending",
    )
  }
}
