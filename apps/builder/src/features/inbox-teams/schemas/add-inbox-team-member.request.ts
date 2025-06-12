import { z } from "zod"

export const addInboxTeamMemberRequest = z.object({
  userIds: z.array(z.string().cuid2()),
})
export type AddInboxTeamMemberRequest = z.infer<
  typeof addInboxTeamMemberRequest
>
