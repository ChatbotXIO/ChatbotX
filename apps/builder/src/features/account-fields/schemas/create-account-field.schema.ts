import { CustomFieldType } from "@ahachat.ai/database/types"
import { z } from "zod"

export const createAccountFieldRequest = z.object({
  name: z.string().trim().min(1).max(255),
  customFieldType: z.nativeEnum(CustomFieldType),
  value: z.string().trim().max(1000).nullable(),
  description: z.string().max(1000).nullable(),
  folderId: z.string().cuid2().nullish(),
})
export type CreateAccountFieldRequest = z.infer<
  typeof createAccountFieldRequest
>
