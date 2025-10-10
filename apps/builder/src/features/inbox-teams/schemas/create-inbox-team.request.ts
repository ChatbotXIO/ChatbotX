import { z } from "zod"

export const createInboxTeamRequest = z.object({
  name: z.string().trim().min(1).max(255),
  userIds: z.array(z.cuid2()),
})
export type CreateInboxTeamRequest = z.infer<typeof createInboxTeamRequest>
