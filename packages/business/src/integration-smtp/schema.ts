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
)
  .pick({
    id: true,
    name: true,
    fromAddress: true,
    imapEnabled: true,
    imapHost: true,
    imapPort: true,
    imapMailbox: true,
    lastPolledAt: true,
    lastPollError: true,
  })
  .extend({
    provider: z
      .string()
      .describe("Provider preset the credentials were created for."),
    inboundWebhookIssued: z
      .boolean()
      .describe(
        "A webhook URL exists for this inbox (relay providers receive mail through it).",
      ),
  })
export type IntegrationSmtpResource = z.infer<typeof integrationSmtpResource>
