"use server"

import {
  channelTokenRefreshService,
  isWorkspaceScheduledForDeletion,
} from "@chatbotx.io/business"
import { isCloud } from "@/env"
import { getAllWorkspaceMembers } from "@/features/workspace-members/queries"
import { authActionClient } from "@/lib/safe-action"
import { resolveWorkspaceBlockState } from "@/lib/workspace-quota"
import { channelTokenRefreshCallbacks } from "../lib/channel-refresh-callbacks"

type RefreshSummary = { refreshed: number; failed: number }

/**
 * Excludes workspaces mid-deletion-grace-window or blocked for trial/quota
 * reasons (AGENTS.md invariant #14) from the bulk refresh, matching the gates
 * `workspaceActionClient` applies to every single-workspace mutation.
 */
async function filterRefreshableWorkspaceIds(
  workspaces: Array<{
    id: string
    ownerId: string
    scheduledDeletionAt?: Date | string | null
  }>,
): Promise<string[]> {
  const cloud = isCloud()
  const refreshableIds = await Promise.all(
    workspaces.map(async (workspace) => {
      if (isWorkspaceScheduledForDeletion(workspace)) {
        return null
      }
      if (cloud) {
        const { blocked } = await resolveWorkspaceBlockState(workspace.ownerId)
        if (blocked) {
          return null
        }
      }
      return workspace.id
    }),
  )
  return refreshableIds.filter((id): id is string => id !== null)
}

export const refreshAllChannelTokensAction = authActionClient.action(
  async ({ ctx }): Promise<RefreshSummary> => {
    const { workspaces } = await getAllWorkspaceMembers(ctx.user.id)
    const workspaceIds = await filterRefreshableWorkspaceIds(workspaces)
    if (workspaceIds.length === 0) {
      return { refreshed: 0, failed: 0 }
    }

    return await channelTokenRefreshService.refreshWorkspaces({
      workspaceIds,
      ...channelTokenRefreshCallbacks,
    })
  },
)
