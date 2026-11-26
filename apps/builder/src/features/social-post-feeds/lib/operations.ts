import { socialPostFeedService } from "@chatbotx.io/business"
import type { z } from "zod"
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"
import type {
  createPostFeedRequest,
  listPostFeedItemsRequest,
  listPostFeedsRequest,
  previewPostFeedRequest,
  updatePostFeedRequest,
} from "../schema"

/** The workspace a call acts in: `ownerId` decides whether a trial-expired block applies. */
type Workspace = { id: string; ownerId: string }

/**
 * The feed operations the public API and the page's session procedures share.
 * Reading, pausing and deleting stay open in a trial-expired workspace
 * (invariant 14); everything that fetches the outside world or makes posts
 * (create, update, resume, run now, preview) is refused there.
 */
export const postFeedOperations = {
  list: async (
    workspaceId: string,
    filters: z.output<typeof listPostFeedsRequest> = {},
  ) => await socialPostFeedService.list({ ...filters, workspaceId }),

  get: async (workspaceId: string, id: string) =>
    await socialPostFeedService.get({ id, workspaceId }),

  create: async (
    workspace: Workspace,
    createdById: string | null,
    input: z.output<typeof createPostFeedRequest>,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostFeedService.create({
      ...input,
      createdById,
      workspaceId: workspace.id,
    })
  },

  update: async (
    workspace: Workspace,
    input: z.output<typeof updatePostFeedRequest>,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostFeedService.update({
      ...input,
      workspaceId: workspace.id,
    })
  },

  delete: async (workspaceId: string, id: string) => {
    await socialPostFeedService.delete({ id, workspaceId })
  },

  bulkDelete: async (workspaceId: string, ids: string[]) =>
    await socialPostFeedService.deleteMany({ ids, workspaceId }),

  pause: async (workspaceId: string, id: string) =>
    await socialPostFeedService.pause({ id, workspaceId }),

  resume: async (workspace: Workspace, id: string) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostFeedService.resume({
      id,
      workspaceId: workspace.id,
    })
  },

  checkNow: async (workspace: Workspace, id: string) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostFeedService.checkNow({
      id,
      workspaceId: workspace.id,
    })
  },

  listItems: async (
    workspaceId: string,
    input: z.output<typeof listPostFeedItemsRequest>,
  ) => await socialPostFeedService.listItems({ ...input, workspaceId }),

  /** Refused in a trial-expired workspace: it fetches the outside world and may spend AI. */
  sendTest: async (
    workspace: Workspace,
    createdById: string | null,
    id: string,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostFeedService.sendTest({
      createdById,
      id,
      workspaceId: workspace.id,
    })
  },

  itemDraftContent: async (
    workspace: Workspace,
    input: { id: string; itemId: string },
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostFeedService.itemDraftContent({
      ...input,
      workspaceId: workspace.id,
    })
  },

  preview: async (
    workspace: Workspace,
    input: z.output<typeof previewPostFeedRequest>,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostFeedService.preview({
      ...input,
      workspaceId: workspace.id,
    })
  },
}
