import { apiConnectConfigSchema } from "@chatbotx.io/business/integration-api/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createApiRequest = apiConnectConfigSchema.extend({
  workspaceId: zodBigintAsString().nullish(),
})
export type CreateApiRequest = z.infer<typeof createApiRequest>

export const updateApiRequest = z.object({
  name: z.string().min(1).max(40).optional(),
  callbackUrl: z.url().nullish(),
})
export type UpdateApiRequest = z.infer<typeof updateApiRequest>
