import { customFieldType } from "@aha.chat/database/schema"
import { z } from "zod"

export const createCustomFieldRequest = z.object({
  name: z.string().trim().min(1).max(255),
  customFieldType: z.enum(customFieldType.enumValues),
  folderId: z.cuid2().nullish(),
  description: z.string().nullish(),
})
export type CreateCustomFieldRequest = z.infer<typeof createCustomFieldRequest>

export const createCustomFieldResponse = z.object({
  id: z.string(),
})
export type CreateCustomFieldResponse = z.infer<
  typeof createCustomFieldResponse
>

export const updateCustomFieldRequest = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().optional(),
  folderId: z.cuid2().nullish(),
})
export type UpdateCustomFieldRequest = z.infer<typeof updateCustomFieldRequest>
