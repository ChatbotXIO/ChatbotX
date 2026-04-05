import { customFieldTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const createBotFieldRequest = z.object({
  name: z.string().trim().min(1).max(255),
  type: customFieldTypes,
  value: z.string().trim().max(1000).nullable(),
  description: z.string().max(1000).nullable(),
  folderId: zodBigintAsString().nullish(),
})
export type CreateBotFieldRequest = z.infer<typeof createBotFieldRequest>

export const updateBotFieldRequest = createBotFieldRequest.partial()
export type UpdateBotFieldRequest = z.infer<typeof updateBotFieldRequest>
