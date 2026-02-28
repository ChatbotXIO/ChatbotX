import { customFieldType } from "@aha.chat/database/schema"
import { z } from "zod"

export const createCustomFieldSchema = z.object({
  name: z.string().trim().min(1).max(255),
  customFieldType: z.enum(customFieldType.enumValues),
  folderId: z.cuid2().nullable(),
  description: z.string().nullable(),
})
export type CreateCustomFieldSchema = z.infer<typeof createCustomFieldSchema>
