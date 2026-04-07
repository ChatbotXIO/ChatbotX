import { z } from "zod"

export const connectTelegramRequest = z.object({
  botToken: z.string().trim().min(1),
  workspaceId: z.string().nullish(),
})

export type ConnectTelegramRequest = z.infer<typeof connectTelegramRequest>
