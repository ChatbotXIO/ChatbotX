import { z } from "zod"

export const updateInboxTeamRequest = z.object({
  name: z.string().trim().min(1).max(255).optional(),
})
export type UpdateInboxTeamRequest = z.infer<typeof updateInboxTeamRequest>
