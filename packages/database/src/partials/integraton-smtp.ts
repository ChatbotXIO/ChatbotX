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

export const getEncryption = (port: number): "ssl" | "tls" =>
  port === 465 ? "ssl" : "tls"
