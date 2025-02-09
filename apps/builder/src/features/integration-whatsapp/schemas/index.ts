import type { IntegrationWhatsapp } from "@prisma/client"
import { z } from "zod"

export type IntegrationWhatsappResource = IntegrationWhatsapp

export const connectWhatsappSchema = z.object({
  // referer: z.string().url(),
})
export type ConnectWhatsappSchema = z.infer<typeof connectWhatsappSchema>
