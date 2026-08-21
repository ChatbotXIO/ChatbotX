import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createApiRequest = z.object({
  name: z.string().min(1).max(40),
  workspaceId: zodBigintAsString().nullish(),
  callbackUrl: z.url().nullish(),
})
export type CreateApiRequest = z.infer<typeof createApiRequest>

export const updateApiRequest = z.object({
  name: z.string().min(1).max(40).optional(),
  callbackUrl: z.url().nullish(),
})
export type UpdateApiRequest = z.infer<typeof updateApiRequest>
