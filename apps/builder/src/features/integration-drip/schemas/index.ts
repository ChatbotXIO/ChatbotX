import { z } from "zod"

export const connectDripSchema = z.object({
  apiToken: z.string().min(1),
})

export type ConnectDripSchema = z.infer<typeof connectDripSchema>

export const dripQuerySchema = z.object({
  action: z.enum(["accounts", "tags", "fields"]),
})

export type DripQuerySchema = z.infer<typeof dripQuerySchema>
