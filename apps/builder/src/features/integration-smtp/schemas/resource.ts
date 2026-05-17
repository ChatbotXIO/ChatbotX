import {
  createSelectSchema,
  integrationSmtpModel,
} from "@chatbotx.io/database/schema"
import type { smtpProviders } from "@chatbotx.io/integration-smtp/schema"
import { z } from "zod"

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
  },
).pick({
  id: true,
  name: true,
})
export type IntegrationSmtpResource = z.infer<typeof integrationSmtpResource>

export const listIntegrationSmtpsResponse = z.object({
  data: z.array(integrationSmtpResource),
})
export type ListIntegrationSmtpsResponse = z.infer<
  typeof listIntegrationSmtpsResponse
>
