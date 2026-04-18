import {
  createSelectSchema,
  integrationInstagramModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"

export const integrationInstagramResource = createSelectSchema(
  integrationInstagramModel,
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
