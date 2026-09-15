import {
  type BaseConfig,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
} from "@chatbotx.io/sdk"
import { sendMail } from "./actions"
import type { SmtpActions, SmtpAuthValue } from "./schema"

const config: IntegrationDefinition<BaseConfig, SmtpAuthValue, SmtpActions> = {
  name: "smtp",
  channels: {
    channel: {
      message: {},
    },
  },
  actions: {
    sendMail,
  },
  connection: {
    kind: "channel",
    strategy: "self_serve",
    multiAccount: true,
    configFields: [
      {
        name: "provider",
        type: "enum",
        required: true,
        labelKey: "integrations.smtp.fields.provider",
        enumValues: [
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
        ],
      },
      {
        name: "host",
        type: "string",
        required: true,
        labelKey: "integrations.smtp.fields.host",
      },
      {
        name: "port",
        type: "number",
        required: true,
        labelKey: "integrations.smtp.fields.port",
      },
      {
        name: "username",
        type: "string",
        required: true,
        labelKey: "integrations.smtp.fields.username",
      },
      {
        name: "password",
        type: "secret",
        required: true,
        labelKey: "integrations.smtp.fields.password",
      },
    ],
    describe: (auth) => ({
      // SMTP credentials do not carry a stable external account ID.
      sourceId: "workspace",
      displayName: `SMTP (${auth.provider})`,
    }),
    verify: async () => ({ ok: true }),
    // SMTP credentials have no token-revocation concept.
    isRevokedTokenError: () => false,
  },
  handleRequest(_props: HandleRequestProps<BaseConfig>) {
    throw new Error("Method is not implemented.")
  },
  disconnect(_props: SmtpAuthValue): Promise<void> {
    throw new Error("Method is not implemented.")
  },
}

export const integration = new Integration(config)
