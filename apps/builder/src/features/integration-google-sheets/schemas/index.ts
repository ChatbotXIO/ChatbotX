import {
  createSelectSchema,
  integrationGoogleSheetsModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const integrationGoogleSheetsResource = createSelectSchema(
  integrationGoogleSheetsModel,
  {
    id: z.string(),
    workspaceId: z.string(),
    integrationId: z.string(),
  },
).pick({
  id: true,
  workspaceId: true,
  integrationId: true,
})
export type IntegrationGoogleSheetsResource = z.infer<
  typeof integrationGoogleSheetsResource
>

export const connectGoogleSheetsSchema = z.object({
  referer: z.url(),
})
export type ConnectGoogleSheetsSchema = z.infer<
  typeof connectGoogleSheetsSchema
>
