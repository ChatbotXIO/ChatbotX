import type { BaseConfig, Context } from "@chatbotx.io/sdk"
import { customAuthSchema } from "@chatbotx.io/sdk"
import { z } from "zod"

export const smtpProviders = z.enum([
  "google",
  "outlook",
  "yahoo",
  "sendgrid",
  "mailgun",
  "amazon_ses",
  "zoho",
  "postmark",
  "brevo",
  "other",
])
export type SmtpProvider = z.infer<typeof smtpProviders>

/**
 * Relay providers that can POST received mail to a URL (inbound parse).
 * Amazon SES delivers through SNS instead and is not supported here.
 */
export const inboundWebhookProviders = [
  "sendgrid",
  "mailgun",
  "postmark",
  "brevo",
] as const
export type InboundWebhookProvider = (typeof inboundWebhookProviders)[number]

export const isInboundWebhookProvider = (
  provider: string,
): provider is InboundWebhookProvider =>
  (inboundWebhookProviders as readonly string[]).includes(provider)

export type SmtpConfig = BaseConfig

export const smtpHostMap: Record<SmtpProvider, { host: string; port: number }> =
  {
    google: { host: "smtp.gmail.com", port: 587 },
    outlook: { host: "smtp.office365.com", port: 587 },
    yahoo: { host: "smtp.mail.yahoo.com", port: 587 },
    sendgrid: { host: "smtp.sendgrid.net", port: 587 },
    mailgun: { host: "smtp.mailgun.org", port: 587 },
    amazon_ses: { host: "email-smtp.us-east-1.amazonaws.com", port: 587 },
    zoho: { host: "smtp.zoho.com", port: 587 },
    postmark: { host: "smtp.postmarkapp.com", port: 587 },
    brevo: { host: "smtp-relay.brevo.com", port: 587 },
    other: { host: "", port: 0 },
  }

/**
 * IMAP endpoint per provider. `null` = the provider is an outbound relay with
 * no mailbox to poll (inbound mail arrives by webhook instead); `other` is
 * entered by the user.
 */
export const imapHostMap: Record<
  SmtpProvider,
  { host: string; port: number } | null
> = {
  google: { host: "imap.gmail.com", port: 993 },
  outlook: { host: "outlook.office365.com", port: 993 },
  yahoo: { host: "imap.mail.yahoo.com", port: 993 },
  zoho: { host: "imap.zoho.com", port: 993 },
  other: { host: "", port: 0 },
  sendgrid: null,
  mailgun: null,
  amazon_ses: null,
  postmark: null,
  brevo: null,
}

export const getEncryption = (port: number): "ssl" | "tls" =>
  port === 465 ? "ssl" : "tls"

export const smtpAuthSchema = customAuthSchema.extend({
  provider: smtpProviders,
  host: z.string().trim().min(1).max(255),
  port: z.number().int().positive().max(65_535),
  username: z.string().trim().min(1).max(255),
  password: z.string().trim().min(1).max(255),
  // Only for providers whose mailbox login differs from the SMTP login;
  // otherwise IMAP reuses `username`/`password` (one app password).
  imapUsername: z.string().trim().min(1).max(255).optional(),
  imapPassword: z.string().trim().min(1).max(255).optional(),
})
export type SmtpAuthValue = z.infer<typeof smtpAuthSchema>

export type SmtpActions<IAuth extends SmtpAuthValue = SmtpAuthValue> = {
  sendMail: (props: {
    ctx: Context<IAuth>
    from: string
    to: string
    subject: string
    html: string
  }) => Promise<void>
}
