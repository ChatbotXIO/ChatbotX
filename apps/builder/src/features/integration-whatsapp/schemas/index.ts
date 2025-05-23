import type { IntegrationWhatsapp } from "@ahachat.ai/database/types"
import { z } from "zod"

export type IntegrationWhatsappResource = IntegrationWhatsapp

export const connectWhatsappSchema = z.object({
  wabaId: z.string(),
  accessToken: z.string(),
})
export type ConnectWhatsappSchema = z.infer<typeof connectWhatsappSchema>
