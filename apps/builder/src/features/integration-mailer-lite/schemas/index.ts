import { z } from "zod"

export const connectMailerLiteSchema = z.object({
  apiKey: z.string().min(1),
})

export type ConnectMailerLiteSchema = z.infer<typeof connectMailerLiteSchema>

export const mailerLiteQuerySchema = z.object({
  action: z.enum(["testConnection", "groups", "fields"]),
})

export type MailerLiteQuerySchema = z.infer<typeof mailerLiteQuerySchema>
