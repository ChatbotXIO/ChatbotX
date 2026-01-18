import { z } from "zod"

export const connectKlaviyoSchema = z.object({
  apiKey: z.string().min(1),
})

export type ConnectKlaviyoSchema = z.infer<typeof connectKlaviyoSchema>

export const klaviyoQuerySchema = z.object({
  action: z.enum(["lists", "tags", "fields"]),
})

export type KlaviyoQuerySchema = z.infer<typeof klaviyoQuerySchema>
