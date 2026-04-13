import {
  type BaseConfig,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
} from "@chatbotx.io/sdk"
import type { SmtpActions, SmtpAuthValue } from "./schema"

const config: IntegrationDefinition<BaseConfig, SmtpAuthValue, SmtpActions> = {
  name: "smtp",
  channels: {
    channel: {
      message: {},
    },
  },
  actions: {},
  handleRequest(_props: HandleRequestProps<BaseConfig>) {
    throw new Error("Method is not implemented.")
  },
  disconnect(_props: SmtpAuthValue): Promise<void> {
    throw new Error("Method is not implemented.")
  },
}

export const integration = new Integration(config)
