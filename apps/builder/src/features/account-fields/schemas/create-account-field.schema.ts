import { CustomFieldType } from "@aha.chat/database/types"
import { z } from "zod"

export const createAccountFieldRequest = z.object({
  name: z.string().trim().min(1).max(255),
  customFieldType: z.enum(CustomFieldType),
  value: z.string().trim().max(1000).nullable(),
  description: z.string().max(1000).nullable(),
  folderId: z.cuid2().nullish(),
})
export type CreateAccountFieldRequest = z.infer<
  typeof createAccountFieldRequest
>
