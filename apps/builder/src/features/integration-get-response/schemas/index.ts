import { z } from "zod"

export const connectGetResponseSchema = z.object({
  apiKey: z.string().min(1),
})

export type ConnectGetResponseSchema = z.infer<typeof connectGetResponseSchema>

export const getResponseQuerySchema = z.object({
  action: z.enum(["campaigns", "tags"]),
})

export type GetResponseQuerySchema = z.infer<typeof getResponseQuerySchema>
