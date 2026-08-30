import { z } from "zod"

export const connectTiktokRequest = z.object({
  accessToken: z.string().min(1),
  openId: z.string().min(1),
  displayName: z.string().min(1),
  clientSecret: z.string().min(1),
  workspaceId: z.string().nullish(),
})

export type ConnectTiktokRequest = z.infer<typeof connectTiktokRequest>
