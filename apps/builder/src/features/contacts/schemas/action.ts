import { Operator } from "@aha.chat/database/enums"
import { Gender } from "@aha.chat/database/types"
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
  gender: z.enum(Gender),
})
export type CreateContactRequest = z.infer<typeof createContactRequest>

export const updateContactRequest = z.record(z.string(), z.string())
export type UpdateContactRequest = z.infer<typeof updateContactRequest>

export const filterContactRequest = z.object({
  filters: z.object({
    operator: z.enum(["and", "or"]),
    conditions: z.array(
      z.object({
        field: z.string().trim(),
        operator: z.enum(Operator),
        value: z.union([z.string(), z.array(z.string())]),
      }),
    ),
  }),
})
export type FilterContactRequest = z.infer<typeof filterContactRequest>
