import type { IntegrationGoogleSheets } from "@ahachat.ai/database/types"
import { z } from "zod"

export type IntegrationGoogleSheetsResource = IntegrationGoogleSheets

export const connectGoogleSheetsSchema = z.object({
  referer: z.string().url(),
})
export type ConnectGoogleSheetsSchema = z.infer<
  typeof connectGoogleSheetsSchema
>
