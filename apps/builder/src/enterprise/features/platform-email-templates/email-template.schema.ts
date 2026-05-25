import { z } from "zod"

export const emailTemplateTypes = [
  "signup",
  "forgotPassword",
  "magicLink",
] as const
export type EmailTemplateType = (typeof emailTemplateTypes)[number]

export const updateEmailTemplateSchema = z.object({
  type: z.enum(emailTemplateTypes),
  subject: z.string().max(200).nullable(),
  body: z.string().max(100_000).nullable(),
})

export type UpdateEmailTemplateSchema = z.infer<
  typeof updateEmailTemplateSchema
>

export const storedEmailTemplateSchema = z
  .object({ subject: z.string().optional(), body: z.string().optional() })
  .nullable()

export type StoredTemplate = z.infer<typeof storedEmailTemplateSchema>
