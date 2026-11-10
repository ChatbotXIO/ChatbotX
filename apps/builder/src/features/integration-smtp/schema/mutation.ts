import {
  imapHostMap,
  smtpProviders,
} from "@chatbotx.io/integration-smtp/schema"
import { z } from "zod"

const fromAddressRegex = /<([^>]+)>$/

// Accepts plain email or "Display Name <email>" / "Name" <email> formats.
export const fromAddressSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (val) => {
      const match = val.match(fromAddressRegex)
      const email = match ? match[1].trim() : val
      return z.email().safeParse(email).success
    },
    { message: "Invalid from address. Use an email or 'Name <email>' format." },
  )

/**
 * Receiving mail by IMAP polling. Omit `imap` (or send `enabled: false`) for a
 * send-only inbox. Host/port are pinned for known providers (Gmail, Outlook,
 * Yahoo, Zoho) and required for `other`; relay providers (SendGrid, Mailgun,
 * Amazon SES, Postmark, Brevo) have no mailbox to poll.
 */
export const imapSettingsSchema = z.object({
  enabled: z
    .boolean()
    .describe("Poll the mailbox for new mail and open conversations from it."),
  host: z
    .string()
    .trim()
    .max(255)
    .optional()
    .describe("IMAP host. Required when provider is `other`."),
  port: z.coerce
    .number()
    .int()
    .positive()
    .max(65_535)
    .optional()
    .describe("IMAP port (993 for TLS). Required when provider is `other`."),
  mailbox: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional()
    .describe("Mailbox (folder) to read. Defaults to `INBOX`."),
  username: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(
      "IMAP login, only when it differs from the SMTP username. Defaults to the SMTP username.",
    ),
  password: z
    .string()
    .min(1)
    .max(255)
    .optional()
    .describe(
      "IMAP password, only when it differs from the SMTP password. Defaults to the SMTP password.",
    ),
})
export type ImapSettingsRequest = z.infer<typeof imapSettingsSchema>

type ImapRefinable = {
  provider: z.infer<typeof smtpProviders>
  imap?: ImapSettingsRequest
}

/** Rejects an IMAP block the provider cannot serve (relay) or that lacks a custom host/port. */
const refineImap = (data: ImapRefinable, ctx: z.RefinementCtx) => {
  if (!data.imap?.enabled) {
    return
  }
  const preset = imapHostMap[data.provider]
  if (preset === null) {
    ctx.addIssue({
      code: "custom",
      message:
        "This provider is an outbound relay with no mailbox to read. Receive mail through its inbound webhook instead.",
      path: ["imap", "enabled"],
    })
    return
  }
  if (data.provider === "other" && !(data.imap.host && data.imap.port)) {
    ctx.addIssue({
      code: "custom",
      message: "IMAP host and port are required when provider is 'other'",
      path: ["imap", "host"],
    })
  }
}

export const createSmtpRequest = z
  .object({
    provider: smtpProviders.describe(
      "SMTP provider preset, or `other` for a custom server.",
    ),
    host: z
      .string()
      .describe("SMTP server host. Required when provider is `other`."),
    port: z.coerce
      .number()
      .int()
      .positive()
      .max(65_535)
      .describe("SMTP server port. Required when provider is `other`."),
    username: z
      .string()
      .min(1)
      .max(255)
      .describe("SMTP username, and the display name for outgoing broadcasts."),
    password: z.string().min(1).max(255).describe("SMTP password."),
    fromAddress: fromAddressSchema.describe(
      "Sender email address, plain or 'Name <email>' format.",
    ),
    imap: imapSettingsSchema
      .optional()
      .describe(
        "Receive email by IMAP polling. Omit to leave receiving as it is (off for a new integration).",
      ),
  })
  .superRefine((data, ctx) => {
    refineImap(data, ctx)
    if (data.provider === "other") {
      if (!data.host || data.host.trim().length === 0) {
        ctx.addIssue({
          code: "invalid_type",
          message: "Host is required when provider is 'other'",
          path: ["host"],
          expected: "url",
        })
      }
      if (!data.port) {
        ctx.addIssue({
          code: "invalid_type",
          message: "Port is required when provider is 'other'",
          path: ["port"],
          expected: "number",
        })
      }
    }
  })
export type CreateSmtpRequest = z.infer<typeof createSmtpRequest>

export const updateSmtpRequest = z
  .object({
    provider: smtpProviders.describe(
      "SMTP provider preset, or `other` for a custom server.",
    ),
    host: z
      .string()
      .describe("SMTP server host. Required when provider is `other`."),
    port: z.coerce
      .number()
      .int()
      .positive()
      .describe("SMTP server port. Required when provider is `other`."),
    username: z
      .string()
      .min(1)
      .describe("SMTP username, and the display name for outgoing broadcasts."),
    password: z.string().min(1).describe("SMTP password."),
    fromAddress: fromAddressSchema.describe(
      "Sender email address, plain or 'Name <email>' format.",
    ),
    imap: imapSettingsSchema
      .optional()
      .describe(
        "Receive email by IMAP polling. Omit to leave receiving as it is (off for a new integration).",
      ),
  })
  .superRefine((data, ctx) => {
    refineImap(data, ctx)
    if (data.provider === "other") {
      if (!data.host || data.host.trim().length === 0) {
        ctx.addIssue({
          code: "invalid_type",
          message: "Host is required when provider is 'other'",
          path: ["host"],
          expected: "url",
        })
      }
      if (!data.port) {
        ctx.addIssue({
          code: "invalid_type",
          message: "Port is required when provider is 'other'",
          path: ["port"],
          expected: "number",
        })
      }
    }
  })
export type UpdateSmtpRequest = z.infer<typeof updateSmtpRequest>
