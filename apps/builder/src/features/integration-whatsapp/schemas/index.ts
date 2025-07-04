import type { IntegrationWhatsappModel } from "@ahachat.ai/database/types"
import { z } from "zod"

export type IntegrationWhatsappResource = IntegrationWhatsappModel

export const connectWhatsappSchema = z.object({
  wabaId: z.string(),
  accessToken: z.string(),
})
export type ConnectWhatsappSchema = z.infer<typeof connectWhatsappSchema>
