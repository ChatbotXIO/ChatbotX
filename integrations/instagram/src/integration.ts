import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
} from "@aha.chat/sdk"
import { updateInstagramProfile as update } from "./apis/page"
import { getUserProfile } from "./apis/user"
import { agentMarkAsRead, sendTyping } from "./conversation"
import { InstagramAPIException } from "./exception"
import { webhookHandler } from "./handlers/webhook"
import { receiveMessage } from "./incomming-message"
import { sendFlowStep, sendMessage } from "./outgoing-message"
import type {
  InstagramActions,
  InstagramAuthValue,
  InstagramConfig,
} from "./schemas"

const config: IntegrationDefinition<
  InstagramConfig,
  InstagramAuthValue,
  InstagramActions
> = {
  name: "instagram",
  channels: {
    channel: {
      message: {
        sendMessage,
        receiveMessage,
      },
      conversation: {
        sendTyping,
        agentMarkAsRead,
      },
      profile: {
        update,
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
        throw new InstagramAPIException(
          `${props.req.method} ${props.req.url} is not implemented`,
          props.req.url,
        )
    }
  },
  disconnect: (_props: InstagramAuthValue): Promise<void> => {
    throw new Error("Method is not implemented.")
  },
}

export const integration = new Integration<
  IntegrationDefinition<InstagramConfig, InstagramAuthValue, InstagramActions>
>(config)
