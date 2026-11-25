import { socialPostingScheduleService } from "@chatbotx.io/business"
import type { z } from "zod"
import { assertWorkspaceNotBlocked } from "@/lib/workspace-quota"
import type {
  destinationScheduleRequest,
  listFreeSlotsRequest,
  updatePostingScheduleRequest,
} from "../schema"
import type { SocialPostWorkspace } from "./social-post-operations"

type ScheduleKey = z.output<typeof destinationScheduleRequest>
type UpdateInput = z.output<typeof updatePostingScheduleRequest>
type FreeSlotsInput = z.output<typeof listFreeSlotsRequest>

/**
 * The posting-schedule operations the public API and the page's session
 * procedures share. Reads stay open in a trial-expired workspace; editing the
 * schedule (which re-seats the queue) is refused there (invariant 14).
 */
export const postingScheduleOperations = {
  get: async (workspaceId: string, input: ScheduleKey) =>
    await socialPostingScheduleService.get({
      destinationId: input.id,
      workspaceId,
    }),

  update: async (workspace: SocialPostWorkspace, input: UpdateInput) => {
    await assertWorkspaceNotBlocked(workspace.ownerId)
    return await socialPostingScheduleService.update({
      destinationId: input.id,
      slots: input.slots,
      timezone: input.timezone,
      workspaceId: workspace.id,
    })
  },

  freeSlots: async (workspaceId: string, input: FreeSlotsInput) =>
    await socialPostingScheduleService.freeSlots({
      after: input.after,
      destinationId: input.id,
      limit: input.limit,
      workspaceId,
    }),
}
