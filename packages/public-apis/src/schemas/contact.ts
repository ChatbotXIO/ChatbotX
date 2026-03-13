import { z } from "zod"
import { customFieldSchema } from "./custom-field"
import { tagSchema } from "./tag"

export const findContactRequest = z.object({
  id: z.string(),
})
export type FindContactRequest = z.infer<typeof findContactRequest>

export const findContactsByCustomFieldRequest = z.object({
  customFieldId: z.string(),
  value: z.string(),
})
export type FindContactsByCustomFieldRequest = z.infer<
  typeof findContactsByCustomFieldRequest
>

export const contactSchema = z.object({
  id: z.string(),
  phoneNumber: z.string(),
  email: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  gender: z.enum(["male", "female", "unknown"]),
  source: z.enum(["webchat", "messenger", "whatsapp", "zalo"]),
  sourceId: z.string().nullable(),
  tags: z.array(tagSchema),
  customFields: z.array(customFieldSchema),
})
export type Contact = z.infer<typeof contactSchema>
