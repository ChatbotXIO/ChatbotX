import { z } from "zod"

export const connectSendFoxSchema = z.object({
  accessToken: z.string().min(1, "Access Token is required"),
})

export type ConnectSendFoxSchema = z.infer<typeof connectSendFoxSchema>

export const sendFoxQuerySchema = z.object({
  action: z.enum(["lists"]),
})

export type SendFoxQuerySchema = z.infer<typeof sendFoxQuerySchema>
