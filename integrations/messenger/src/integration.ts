import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { generateAuthUrl } from "./client"
import { callbackHandler } from "./handlers/callback"
import type {
  MessengerActions,
  MessengerAuthValue,
  MessengerConfig,
} from "./schemas"

const config: IntegrationDefinition<
  MessengerConfig,
  MessengerAuthValue,
  MessengerActions
> = {
  name: "messenger",
  actions: {},
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const method = segments.pop()

    switch (method) {
      case HandleRequestType.CALLBACK:
        return await callbackHandler(props)
      case HandleRequestType.GENERATE_AUTH_URL:
        return generateAuthUrl(props.config)
      default:
        throw new SdkException(
          `Handler: ${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  disconnect: (_props: MessengerAuthValue): Promise<void> => {
    throw new Error("Function not implemented.")
  },
}

export const integration = new Integration<
  IntegrationDefinition<MessengerConfig, MessengerAuthValue, MessengerActions>
>(config)
