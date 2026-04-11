import {
  type BaseConfig,
  type HandleRequestProps,
  Integration,
  type IntegrationDefinition,
  type Oauth2AuthValue,
} from "@chatbotx.io/sdk"
import { webhookHandler } from "./handlers/webhook"
import type { EmailActions, EmailAuthValue } from "./schema"

const config: IntegrationDefinition<BaseConfig, EmailAuthValue, EmailActions> =
  {
    name: "email",
    channels: {
      channel: {
        message: {},
      },
    },
    actions: {},
    async handleRequest(
      props: HandleRequestProps<BaseConfig>,
    ): Promise<string | number | Oauth2AuthValue> {
      const segments = new URL(props.req.url).pathname.split("/")
      const action = segments.pop()
      switch (action) {
        case "webhook":
          return await webhookHandler(props)
        default:
          throw new Error(
            `Not implemented: ${props.req.method} ${props.req.url}`,
          )
      }
    },
    disconnect(_props: EmailAuthValue): Promise<void> {
      throw new Error("Method is not implemented.")
    },
  }

export const integration = new Integration(config)
