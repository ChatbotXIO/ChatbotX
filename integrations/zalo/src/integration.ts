import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  SdkException,
} from "@aha.chat/sdk"
import { getUserProfile } from "./api/user"
import { callbackHandler } from "./handlers/callback"
import { webhookHandler } from "./handlers/webhook"
import { parseIncomingMessage } from "./incoming-message"
import { sendOutgoingMessage } from "./outgoing-message"
import type {
  ZaloActions,
  ZaloAuthValue,
  ZaloConfig,
} from "./schemas/definition"

const config: IntegrationDefinition<ZaloConfig, ZaloAuthValue, ZaloActions> = {
  name: "zalo",
  actions: {
    receiveMessage: async ({ data }) => {
      return await parseIncomingMessage(data)
    },
    sendMessage: async ({ ctx, message, conversation }) => {
      await sendOutgoingMessage(ctx, conversation, message)
    },
    getUserProfile: async ({ ctx, uid }) => {
      return await getUserProfile({ ctx, uid })
    },
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const method = segments.pop()

    switch (method) {
      case HandleRequestType.WEBHOOK:
        return await webhookHandler(props)
      case HandleRequestType.CALLBACK:
        return await callbackHandler(props)
      default:
        throw new SdkException(
          `Handler: ${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  disconnect: (_props: ZaloAuthValue): Promise<void> => {
    throw new Error("Function not implemented.")
  },
}

export const integration = new Integration<
  IntegrationDefinition<ZaloConfig, ZaloAuthValue, ZaloActions>
>(config)
