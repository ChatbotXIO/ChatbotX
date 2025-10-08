import { z } from "zod"

export const addInboxTeamMemberRequest = z.object({
  userIds: z.array(z.cuid2()),
})
export type AddInboxTeamMemberRequest = z.infer<
  typeof addInboxTeamMemberRequest
>
