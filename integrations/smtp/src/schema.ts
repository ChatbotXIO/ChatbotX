import type { BaseConfig } from "@chatbotx.io/sdk"
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

export const getEncryption = (port: number): "ssl" | "tls" =>
  port === 465 ? "ssl" : "tls"

export const smtpAuthSchema = customAuthSchema.extend({
  provider: smtpProviders,
  host: z.string().trim().min(1).max(255),
  port: z.number().int().positive().max(65_535),
  username: z.string().trim().min(1).max(255),
  password: z.string().trim().min(1).max(255),
  fromAddress: z.email(),
})
export type SmtpAuthValue = z.infer<typeof smtpAuthSchema>

export type SmtpActions = Record<string, never>
