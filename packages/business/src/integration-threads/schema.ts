import {
  createSelectSchema,
  integrationThreadsModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import type { z } from "zod"

// `auth` holds the OAuth tokens, so only the display fields leave the server.
export const integrationThreadsResource = createSelectSchema(
  integrationThreadsModel,
  {
    id: zodBigintAsString(),
    inboxId: zodBigintAsString(),
  },
).pick({
  id: true,
  name: true,
  inboxId: true,
  username: true,
})

export type IntegrationThreadsResource = z.infer<
  typeof integrationThreadsResource
>
