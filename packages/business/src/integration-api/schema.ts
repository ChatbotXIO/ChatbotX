import { z } from "zod"

export const apiConnectConfigSchema = z.object({
  name: z.string().min(1).max(40),
  callbackUrl: z.url().nullish(),
})
