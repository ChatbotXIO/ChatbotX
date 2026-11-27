import {
  socialPostSnippetService,
  socialPostTargetSetService,
} from "@chatbotx.io/business"
import type { SocialPostSnippetKind } from "@chatbotx.io/database/partials"
import type { z } from "zod"
import type { SocialPostWorkspace } from "@/features/social-posts/lib/social-post-operations"
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"
import type {
  createPostSnippetRequest,
  createPostTargetSetRequest,
  updatePostSnippetRequest,
  updatePostTargetSetRequest,
} from "../schema"

/** The workspace a call acts in: `ownerId` decides whether a trial-expired block applies. */
type Workspace = SocialPostWorkspace

/**
 * The snippet and set operations the public API and the page's session
 * procedures share. Reads and delete stay open in a trial-expired workspace
 * (invariant 14); create and update are refused there.
 */
export const postSnippetOperations = {
  list: async (workspaceId: string, kind?: SocialPostSnippetKind) =>
    await socialPostSnippetService.list({ kind, workspaceId }),

  get: async (workspaceId: string, id: string) =>
    await socialPostSnippetService.get({ id, workspaceId }),

  create: async (
    workspace: Workspace,
    input: z.output<typeof createPostSnippetRequest>,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostSnippetService.create({
      ...input,
      workspaceId: workspace.id,
    })
  },

  update: async (
    workspace: Workspace,
    input: z.output<typeof updatePostSnippetRequest>,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostSnippetService.update({
      ...input,
      workspaceId: workspace.id,
    })
  },

  delete: async (workspaceId: string, id: string) => {
    await socialPostSnippetService.delete({ id, workspaceId })
  },
}

export const postTargetSetOperations = {
  list: async (workspaceId: string) =>
    await socialPostTargetSetService.list({ workspaceId }),

  get: async (workspaceId: string, id: string) =>
    await socialPostTargetSetService.get({ id, workspaceId }),

  create: async (
    workspace: Workspace,
    input: z.output<typeof createPostTargetSetRequest>,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostTargetSetService.create({
      ...input,
      workspaceId: workspace.id,
    })
  },

  update: async (
    workspace: Workspace,
    input: z.output<typeof updatePostTargetSetRequest>,
  ) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostTargetSetService.update({
      ...input,
      workspaceId: workspace.id,
    })
  },

  delete: async (workspaceId: string, id: string) => {
    await socialPostTargetSetService.delete({ id, workspaceId })
  },
}
