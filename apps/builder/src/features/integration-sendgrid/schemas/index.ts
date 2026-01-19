import { z } from "zod"

export const connectSendGridSchema = z.object({
  apiKey: z.string().min(1),
})

export type ConnectSendGridSchema = z.infer<typeof connectSendGridSchema>

export const sendGridQuerySchema = z.object({
  action: z.enum(["testConnection", "lists", "fields"]),
})

export type SendGridQuerySchema = z.infer<typeof sendGridQuerySchema>
