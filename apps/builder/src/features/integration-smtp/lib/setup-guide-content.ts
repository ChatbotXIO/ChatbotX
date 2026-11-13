import type { smtpProviders } from "@chatbotx.io/integration-smtp/schema"
import type { z } from "zod"

type SmtpProvider = z.infer<typeof smtpProviders>

/**
 * Setup steps per provider. Keys are literals (never built from the provider
 * name) so the i18n checker and TypeScript can see every one of them.
 */
type GuideContent = {
  readonly steps: readonly string[]
  /** Optional caveat shown under the steps. */
  readonly note?: string
  readonly docsUrl?: string
}

export const setupGuideContent = {
  google: {
    steps: [
      "smtp.guide.providers.google.step1",
      "smtp.guide.providers.google.step2",
      "smtp.guide.providers.google.step3",
      "smtp.guide.providers.google.step4",
    ],
    docsUrl: "https://support.google.com/accounts/answer/185833",
  },
  outlook: {
    steps: [
      "smtp.guide.providers.outlook.step1",
      "smtp.guide.providers.outlook.step2",
      "smtp.guide.providers.outlook.step3",
    ],
    note: "smtp.guide.providers.outlook.note",
    docsUrl:
      "https://support.microsoft.com/account-billing/manage-app-passwords-for-two-step-verification-d6dc8c6d-4bf7-4851-ad95-6d07799387e9",
  },
  yahoo: {
    steps: [
      "smtp.guide.providers.yahoo.step1",
      "smtp.guide.providers.yahoo.step2",
      "smtp.guide.providers.yahoo.step3",
    ],
    docsUrl: "https://help.yahoo.com/kb/SLN15241.html",
  },
  zoho: {
    steps: [
      "smtp.guide.providers.zoho.step1",
      "smtp.guide.providers.zoho.step2",
      "smtp.guide.providers.zoho.step3",
    ],
    docsUrl:
      "https://www.zoho.com/mail/help/adminconsole/two-factor-authentication.html",
  },
  sendgrid: {
    steps: [
      "smtp.guide.providers.sendgrid.step1",
      "smtp.guide.providers.sendgrid.step2",
      "smtp.guide.providers.sendgrid.step3",
    ],
    docsUrl:
      "https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/setting-up-the-inbound-parse-webhook",
  },
  mailgun: {
    steps: [
      "smtp.guide.providers.mailgun.step1",
      "smtp.guide.providers.mailgun.step2",
      "smtp.guide.providers.mailgun.step3",
    ],
    docsUrl:
      "https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/",
  },
  postmark: {
    steps: [
      "smtp.guide.providers.postmark.step1",
      "smtp.guide.providers.postmark.step2",
      "smtp.guide.providers.postmark.step3",
    ],
    docsUrl:
      "https://postmarkapp.com/developer/user-guide/inbound/configure-an-inbound-server",
  },
  brevo: {
    steps: [
      "smtp.guide.providers.brevo.step1",
      "smtp.guide.providers.brevo.step2",
      "smtp.guide.providers.brevo.step3",
    ],
    note: "smtp.guide.providers.brevo.note",
    docsUrl: "https://developers.brevo.com/docs/inbound-parse-webhooks",
  },
  amazon_ses: {
    steps: [
      "smtp.guide.providers.amazonSes.step1",
      "smtp.guide.providers.amazonSes.step2",
      "smtp.guide.providers.amazonSes.step3",
    ],
    note: "smtp.guide.providers.amazonSes.note",
    docsUrl:
      "https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp-credentials.html",
  },
  other: {
    steps: [
      "smtp.guide.providers.other.step1",
      "smtp.guide.providers.other.step2",
    ],
  },
} as const satisfies Record<SmtpProvider, GuideContent>
