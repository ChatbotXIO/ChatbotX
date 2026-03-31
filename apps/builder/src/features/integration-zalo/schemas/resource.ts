import {
  createSelectSchema,
  integrationZaloModel,
} from "@aha.chat/database/schema"
import type z from "zod"

export const integrationZaloResource = createSelectSchema(
  integrationZaloModel,
).pick({
  id: true,
  name: true,
})
export type IntegrationZaloResource = z.infer<typeof integrationZaloResource>
