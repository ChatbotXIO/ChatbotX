import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { getUserProfile } from "./apis/user"
import { webhookHandler } from "./handlers/webhook"
import { parseIncomingMessage } from "./incomming-message"
import { sendOutgoingMessage } from "./outgoing-message"
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
  actions: {
    receiveMessage: async ({ data }) => {
      return await parseIncomingMessage(data)
    },
    sendMessage: async ({ ctx, message, conversation }) => {
      await sendOutgoingMessage(ctx, conversation, message)
    },
    getUserProfile: async ({ ctx, psid }) => {
      return await getUserProfile({ ctx, psid })
    },
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const action = segments.pop()

    switch (action) {
      case HandleRequestType.WEBHOOK:
        return await webhookHandler(props)
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
