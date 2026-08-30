import {
  createSelectSchema,
  integrationModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const publicIntegrationResource = createSelectSchema(integrationModel, {
  id: z.string(),
  workspaceId: z.string(),
})
export type PublicIntegrationResource = z.infer<
  typeof publicIntegrationResource
>

export const publicListIntegrationsResponse = z.object({
  data: z.array(publicIntegrationResource),
})
export type PublicListIntegrationsResponse = z.infer<
  typeof publicListIntegrationsResponse
>
