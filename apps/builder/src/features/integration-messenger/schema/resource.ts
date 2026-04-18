import {
  createSelectSchema,
  integrationMessengerModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import type { z } from "zod"

export const integrationMessengerResource = createSelectSchema(
  integrationMessengerModel,
  {
    id: zodBigintAsString(),
    inboxId: zodBigintAsString(),
  },
).pick({
  id: true,
  name: true,
})
export type IntegrationMessengerResource = z.infer<
  typeof integrationMessengerResource
>
