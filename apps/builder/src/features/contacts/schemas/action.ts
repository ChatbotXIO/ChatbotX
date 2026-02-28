import { gender } from "@aha.chat/database/schema"
import { z } from "zod"

export const createContactRequest = z.object({
  phoneNumber: z
    .string()
    .min(10)
    .max(20)
    .regex(/\+?\d{10,20}/),
  email: z.union([z.literal(""), z.email().max(100)]),
  firstName: z.optional(z.string().trim().max(100)),
  lastName: z.optional(z.string().trim().max(100)),
  gender: z.enum(gender.enumValues),
})
export type CreateContactRequest = z.infer<typeof createContactRequest>

export const updateContactRequest = z.record(z.string(), z.string())
export type UpdateContactRequest = z.infer<typeof updateContactRequest>
