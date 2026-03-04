import { customFieldType } from "@aha.chat/database/schema"
import { z } from "zod"

export const createAccountFieldRequest = z.object({
  name: z.string().trim().min(1).max(255),
  customFieldType: z.enum(customFieldType.enumValues),
  value: z.string().trim().max(1000).nullable(),
  description: z.string().max(1000).nullable(),
  folderId: z.cuid2().nullish(),
})
export type CreateAccountFieldRequest = z.infer<
  typeof createAccountFieldRequest
>

export const updateAccountFieldRequest = createAccountFieldRequest.partial()
export type UpdateAccountFieldRequest = z.infer<
  typeof updateAccountFieldRequest
>
