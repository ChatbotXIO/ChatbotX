import { Operator } from "@aha.chat/database/enums"
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

export const createContactResponse = z.object({
  id: z.string(),
})
export type CreateContactResponse = z.infer<typeof createContactResponse>

export const updateContactFieldRequest = z.record(z.string(), z.string())
export type UpdateContactFieldRequest = z.infer<
  typeof updateContactFieldRequest
>

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
