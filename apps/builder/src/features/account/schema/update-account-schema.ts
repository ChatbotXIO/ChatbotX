import { z } from "zod"

export const updateAccountSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).default(""),
  locale: z.enum(["en", "vi", "pt-BR"]).optional(),
})

export type UpdateAccountRequest = z.infer<typeof updateAccountSchema>
