import {
  resolveWorkspaceFreezeReason,
  workspaceService,
} from "@chatbotx.io/business"
import type { WorkspaceModel } from "@chatbotx.io/database/types"

type ServableWorkspace = {
  servable: boolean
  workspace: WorkspaceModel | undefined
}

/**
 * Freeze gate for in-request public surfaces (reflinks, entrypoint links,
 * unsubscribe, email-topic pixels, /extensions/me). Fail-closed on a missing
 * row: after the purge cron runs, a still-circulating public link must 404/410
 * rather than serve a workspace that no longer exists.
 *
 * The owner entitlement is deliberately NOT consulted here — a trial-expired
 * workspace keeps serving its already-published public links.
 */
export const loadServableWorkspace = async (
  workspaceId: string,
): Promise<ServableWorkspace> => {
  const workspace = await workspaceService.find({ where: { id: workspaceId } })
  const servable = resolveWorkspaceFreezeReason({ workspace }) === null

  return { servable, workspace }
}
