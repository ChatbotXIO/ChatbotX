import { CustomFieldType } from "@ahachat.ai/database/types"
import { z } from "zod"

export const createCustomFieldSchema = z.object({
  name: z.string().trim().min(1).max(255),
  customFieldType: z.nativeEnum(CustomFieldType),
  folderId: z.string().cuid2().nullable(),
  description: z.string().nullable(),
})
export type CreateCustomFieldSchema = z.infer<typeof createCustomFieldSchema>
