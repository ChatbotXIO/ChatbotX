import type { MessageHandlers } from "@chatbotx.io/sdk"
import { getMessageMediaUrls as fetchMessageMediaUrls } from "../../apis/sync"
import type { MessengerAuthValue } from "../../schema"
import {
  downloadAttachments,
  parseEcho,
  receiveMessage,
} from "./incomming-message"
import { sendFlowStep, sendMessage } from "./outgoing-message"

const getMessageMediaUrls: MessageHandlers<MessengerAuthValue>["getMessageMediaUrls"] =
  async ({ ctx, data }) =>
    await fetchMessageMediaUrls({
      graphMessageId: data.graphMessageId,
      accessToken: ctx.auth.tokens.accessToken,
      version: ctx.auth.metadata.version,
    })

export const messageHandlers = {
  sendMessage,
  receiveMessage,
  parseEcho,
  downloadAttachments,
  sendFlowStep,
  getMessageMediaUrls,
}
