import {
  type BaseConfig,
  type ConnectionConfigField,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
  selfServeConnection,
} from "@chatbotx.io/sdk"
import { sendMail } from "./actions"
import type { SmtpActions, SmtpAuthValue } from "./schema"

const smtpFields: readonly ConnectionConfigField[] = [
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
]

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
  connection: selfServeConnection<SmtpAuthValue>({
    displayName: "SMTP",
    multiAccount: false,
    configFields: smtpFields,
    describe: (auth) => ({
      sourceId: "workspace",
      displayName: `SMTP (${auth.provider})`,
    }),
  }),
  handleRequest(_props: HandleRequestProps<BaseConfig>) {
    throw new Error("Method is not implemented.")
  },
  disconnect(_props: SmtpAuthValue): Promise<void> {
    // SMTP credentials are workspace-local (host/port/username/password);
    // there is no external provider session or webhook subscription to
    // tear down, so this is a no-op (mirrors webchat/api's disconnect).
    return Promise.resolve()
  },
}

export const integration = new Integration(config)
