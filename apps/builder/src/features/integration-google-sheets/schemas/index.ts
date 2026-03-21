import type { IntegrationGoogleSheetsModel } from "@chatbotx.io/database/types"
import { z } from "zod"

export type IntegrationGoogleSheetsResource = IntegrationGoogleSheetsModel

export const connectGoogleSheetsSchema = z.object({
  referer: z.url(),
})
export type ConnectGoogleSheetsSchema = z.infer<
  typeof connectGoogleSheetsSchema
>
