import { z } from "zod"

export const revokeMcpOAuthGrantRequest = z.object({
  clientId: z.string().min(1),
})
export type RevokeMcpOAuthGrantRequest = z.infer<
  typeof revokeMcpOAuthGrantRequest
>
