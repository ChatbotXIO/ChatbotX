import {
  createSelectSchema,
  integrationSmtpModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const integrationSmtpResource = createSelectSchema(
  integrationSmtpModel,
  {
    id: z.string(),
  },
).pick({
  id: true,
  name: true,
  fromAddress: true,
})
export type IntegrationSmtpResource = z.infer<typeof integrationSmtpResource>
