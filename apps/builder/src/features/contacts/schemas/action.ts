import { gender, inboxType } from "@aha.chat/database/schema"
import { z } from "zod"

export const contactPrefix = "ct"
export const contactFieldPrefix = "cf"
export const contactTagPrefix = "tg"

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

export const exportContactsRequest = z.object({
  fields: z.array(z.string()).min(1),
  contactIds: z.array(z.string()).min(1),
})
export type ExportContactsRequest = z.infer<typeof exportContactsRequest>

export const importContactsRequest = z.object({
  file: z.instanceof(File),
  inboxType: z.enum(inboxType.enumValues),
  phoneNumber: z.string().optional(),
  contactId: z.string(),
  email: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  tagId: z.string().optional(),
  fieldMapping: z
    .array(
      z.object({
        column: z.string(),
        fieldId: z.string(),
      }),
    )
    .optional(),
})
export type ImportContactsRequest = z.infer<typeof importContactsRequest>
