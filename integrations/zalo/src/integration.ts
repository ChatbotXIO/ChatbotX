import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@chatbotx.io/sdk"
import { callbackHandler } from "./handlers/callback"
import { contactHandlers } from "./handlers/handler"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import type { ZaloAuthValue, ZaloConfig } from "./schema/definition"

const config: IntegrationDefinition<ZaloConfig, ZaloAuthValue> = {
  name: "zalo",
  channels: {
    channel: {
      message: messageHandlers,
      contact: contactHandlers,
    },
  },
  actions: {},
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const method = segments.pop()

    switch (method) {
      case HandleRequestType.webhook:
        return await webhookHandler(props)
      case HandleRequestType.callback:
        return await callbackHandler(props)
      default:
        throw new SdkException(
          `Handler: ${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  disconnect: (_props: ZaloAuthValue): Promise<void> => {
    throw new Error("Method is not implemented.")
  },
}

export const integration = new Integration<
  IntegrationDefinition<ZaloConfig, ZaloAuthValue>
>(config)
