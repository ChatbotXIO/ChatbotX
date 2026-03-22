import { customFieldType } from "@aha.chat/database/schema"
import { z } from "zod"

export const createBotFieldRequest = z.object({
  name: z.string().trim().min(1).max(255),
  type: z.enum(customFieldType.enumValues),
  value: z.string().trim().max(1000).nullable(),
  description: z.string().max(1000).nullable(),
  folderId: z.cuid2().nullish(),
})
export type CreateBotFieldRequest = z.infer<typeof createBotFieldRequest>

export const updateBotFieldRequest = createBotFieldRequest.partial()
export type UpdateBotFieldRequest = z.infer<typeof updateBotFieldRequest>
