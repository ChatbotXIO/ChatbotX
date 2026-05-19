import { genderTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const contactPrefix = "sys"
export const contactFieldPrefix = "cus"
export const contactTagPrefix = "tag"

export const createContactRequest = z.object({
  phoneNumber: z
    .string()
    .min(10)
    .max(20)
    .regex(/\+?\d{10,20}/),
  email: z.union([z.literal(""), z.email().max(100)]),
  firstName: z.optional(z.string().trim().max(100)),
  lastName: z.optional(z.string().trim().max(100)),
  gender: genderTypes,
})
export type CreateContactRequest = z.infer<typeof createContactRequest>

export const createContactResponse = z.object({
  id: zodBigintAsString(),
})
export type CreateContactResponse = z.infer<typeof createContactResponse>

export const updateContactFieldRequest = z.record(z.string(), z.string())
export type UpdateContactFieldRequest = z.infer<
  typeof updateContactFieldRequest
>

export const exportContactsRequest = z.object({
  fields: z.array(z.string()).min(1),
  contactIds: z.array(zodBigintAsString()).min(1),
})
export type ExportContactsRequest = z.infer<typeof exportContactsRequest>
