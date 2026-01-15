import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  type SendFlowStepProps,
} from "@aha.chat/sdk"
import { getUserProfile } from "./apis/user"
import { MessengerAPIException } from "./exception"
import { webhookHandler } from "./handlers/webhook"
import { parseIncomingMessage } from "./incomming-message"
import { sendFlowStep, sendOutgoingMessage } from "./outgoing-message"
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
    receiveMessage: async ({ ctx, data }) =>
      await parseIncomingMessage({ ctx, data }),
    sendMessage: async ({ ctx, message, conversation }) => {
      await sendOutgoingMessage(ctx, conversation, message)
    },
    sendFlowStep: async (props: SendFlowStepProps<MessengerAuthValue>) => {
      await sendFlowStep(props)
    },
    getUserProfile: async ({ ctx, psid }) =>
      await getUserProfile({ ctx, psid }),
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
    throw new Error("Function not implemented.")
  },
}

export const integration = new Integration<
  IntegrationDefinition<MessengerConfig, MessengerAuthValue, MessengerActions>
>(config)
