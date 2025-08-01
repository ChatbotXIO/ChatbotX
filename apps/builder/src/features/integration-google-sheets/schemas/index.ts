import type { IntegrationGoogleSheetsModel } from "@aha.chat/database/types"
import { z } from "zod"

export type IntegrationGoogleSheetsResource = IntegrationGoogleSheetsModel

export const connectGoogleSheetsSchema = z.object({
  referer: z.string().url(),
})
export type ConnectGoogleSheetsSchema = z.infer<
  typeof connectGoogleSheetsSchema
>
