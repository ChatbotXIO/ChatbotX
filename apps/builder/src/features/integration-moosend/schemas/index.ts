import { z } from "zod"

export const connectMoosendSchema = z.object({
  apiKey: z.string().min(1, "API Key is required"),
})

export type ConnectMoosendSchema = z.infer<typeof connectMoosendSchema>

export const moosendQuerySchema = z.object({
  action: z.enum(["lists"]),
})

export type MoosendQuerySchema = z.infer<typeof moosendQuerySchema>
