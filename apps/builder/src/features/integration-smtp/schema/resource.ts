import {
  createSelectSchema,
  integrationSmtpModel,
} from "@chatbotx.io/database/schema"
import type { smtpProviders } from "@chatbotx.io/integration-smtp/schema"
import { z } from "zod"
import { fromAddressSchema } from "./mutation"

export const smtpProviderLabels: Record<
  z.infer<typeof smtpProviders>,
  string
> = {
  google: "Google (Gmail)",
  outlook: "Outlook (Office 365)",
  yahoo: "Yahoo Mail",
  sendgrid: "SendGrid",
  mailgun: "Mailgun",
  amazon_ses: "Amazon SES",
  zoho: "Zoho Mail",
  postmark: "Postmark",
  brevo: "Brevo (Sendinblue)",
  other: "Other",
}

export const integrationSmtpResource = createSelectSchema(
  integrationSmtpModel,
  {
    id: z.string(),
    name: z.string(),
    fromAddress: fromAddressSchema,
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
    provider: z.string(),
    inboundWebhookIssued: z.boolean(),
  })
export type IntegrationSmtpResource = z.infer<typeof integrationSmtpResource>

export const listIntegrationSmtpsResponse = z.object({
  data: z.array(integrationSmtpResource),
})
export type ListIntegrationSmtpsResponse = z.infer<
  typeof listIntegrationSmtpsResponse
>

export const inboundWebhookResource = z.object({
  provider: z
    .enum(["sendgrid", "mailgun", "postmark", "brevo"])
    .describe("Relay provider the webhook payload format is read as."),
  url: z
    .string()
    .describe(
      "Secret inbound-parse URL to paste into the provider. Treat it like a password.",
    ),
  instructions: z
    .string()
    .describe("Where to configure this URL in the provider's dashboard."),
})
export type InboundWebhookResource = z.infer<typeof inboundWebhookResource>
