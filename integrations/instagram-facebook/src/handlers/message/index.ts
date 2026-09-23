import type { MessageHandlers } from "@chatbotx.io/sdk"
import { getMessageMediaUrls as fetchMessageMediaUrls } from "../../apis/sync"
import type { InstagramAuthValue } from "../../schemas"
import { receiveMessage } from "./incoming-message"
import { sendFlowStep, sendMessage } from "./outgoing-message"

const getMessageMediaUrls: MessageHandlers<InstagramAuthValue>["getMessageMediaUrls"] =
  async ({ ctx, data }) =>
    await fetchMessageMediaUrls({
      graphMessageId: data.graphMessageId,
      accessToken: ctx.auth.tokens.accessToken,
      version: ctx.auth.metadata.version,
    })

export const messageHandlers = {
  receiveMessage,
  sendMessage,
  sendFlowStep,
  getMessageMediaUrls,
}
