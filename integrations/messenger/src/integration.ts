import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
} from "@aha.chat/sdk"
import { getUserProfile } from "./apis/user"
import { agentMarkAsRead, sendTyping } from "./conversation"
import { MessengerAPIException } from "./exception"
import { webhookHandler } from "./handlers/webhook"
import { receiveMessage } from "./incomming-message"
import { sendFlowStep, sendMessage } from "./outgoing-message"
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
  channels: {
    channel: {
      message: {
        receiveMessage,
        sendMessage,
      },
      conversation: {
        sendTyping,
        agentMarkAsRead,
      },
    },
  },
  actions: {
    sendFlowStep,
    getUserProfile,
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const action = segments.pop()

    switch (action) {
      case HandleRequestType.webhook:
        return await webhookHandler(props)
      default:
        throw new MessengerAPIException(
          `${props.req.method} ${props.req.url} is not implemented`,
          props.req.url,
        )
    }
  },
  disconnect: (_props: MessengerAuthValue): Promise<void> => {
    throw new Error("Method is not implemented.")
  },
}

export const integration = new Integration<
  IntegrationDefinition<MessengerConfig, MessengerAuthValue, MessengerActions>
>(config)
