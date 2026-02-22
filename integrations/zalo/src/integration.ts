import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { getUserProfile } from "./api/user"
import { callbackHandler } from "./handlers/callback"
import { webhookHandler } from "./handlers/webhook"
import { receiveMessage } from "./incoming-message"
import { sendFlowStep, sendOutgoingMessage } from "./outgoing-message"
import type {
  ZaloActions,
  ZaloAuthValue,
  ZaloConfig,
} from "./schemas/definition"

const config: IntegrationDefinition<ZaloConfig, ZaloAuthValue, ZaloActions> = {
  name: "zalo",
  channels: {
    channel: {
      message: {
        sendMessage: sendOutgoingMessage,
        receiveMessage,
      },
    },
  },
  actions: {
    sendFlowStep: async (props) => {
      await sendFlowStep(props)
    },
    getUserProfile: async ({ ctx, psid }) =>
      await getUserProfile({ ctx, psid }),
  },
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
  IntegrationDefinition<ZaloConfig, ZaloAuthValue, ZaloActions>
>(config)
