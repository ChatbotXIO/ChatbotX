import {
  createSelectSchema,
  integrationZaloModel,
} from "@chatbotx.io/database/schema"
import type z from "zod"

export const integrationZaloResource = createSelectSchema(integrationZaloModel)
export type IntegrationZaloResource = z.infer<typeof integrationZaloResource>
