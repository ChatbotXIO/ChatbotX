import { z } from "zod"

export const acceptInvitationRequest = z.object({
  code: z.string(),
})

export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequest>
