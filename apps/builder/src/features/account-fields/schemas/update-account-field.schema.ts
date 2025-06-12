import { z } from "zod"

export const updateAccountFieldRequest = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(1000).optional(),
  // value: z.string().trim().max(1000).optional(),
  folderId: z.string().cuid2().nullish(),
})
export type UpdateAccountFieldRequest = z.infer<
  typeof updateAccountFieldRequest
>
