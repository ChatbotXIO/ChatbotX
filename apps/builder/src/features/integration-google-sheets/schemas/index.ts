import type { IntegrationGoogleSheets } from "@prisma/client"
import { z } from "zod"

export type IntegrationGoogleSheetsResource = IntegrationGoogleSheets

export const connectGoogleSheetsSchema = z.object({
  referer: z.string().url(),
})
export type ConnectGoogleSheetsSchema = z.infer<
  typeof connectGoogleSheetsSchema
>
