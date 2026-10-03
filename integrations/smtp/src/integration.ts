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
  },
  {
    name: "port",
    type: "number",
    required: true,
  },
  {
    name: "username",
    type: "string",
    required: true,
  },
  {
    name: "password",
    type: "secret",
    required: true,
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
