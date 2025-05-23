import { z } from "zod"

export const updateContactRequest = z.object({
  phoneNumber: z
    .string()
    .min(10)
    .max(20)
    .regex(/\+?\d{10,20}/)
    .optional(),
  email: z.string().max(100).email().optional(),
  firstName: z.optional(z.string().trim().max(100)).optional(),
  lastName: z.optional(z.string().trim().max(100)).optional(),
})
export type UpdateContactRequest = z.infer<typeof updateContactRequest>
