import {
  createSelectSchema,
  integrationMessengerModel,
} from "@aha.chat/database/schema"
import type { z } from "zod"

export const integrationMessengerResource = createSelectSchema(
  integrationMessengerModel,
).pick({
  id: true,
  name: true,
})
export type IntegrationMessengerResource = z.infer<
  typeof integrationMessengerResource
>
