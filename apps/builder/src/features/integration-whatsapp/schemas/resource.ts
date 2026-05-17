import {
  createSelectSchema,
  integrationWhatsappModel,
} from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import type { z } from "zod"

export const integrationWhatsappResource = createSelectSchema(
  integrationWhatsappModel,
  {
    id: zodBigintAsString(),
    inboxId: zodBigintAsString(),
  },
).pick({
  id: true,
  name: true,
  inboxId: true,
  displayPhoneNumber: true,
})

export type IntegrationWhatsappResource = z.infer<
  typeof integrationWhatsappResource
>
