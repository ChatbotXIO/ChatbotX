import { type ConversationHandlers, SdkException } from "@chatbotx.io/sdk"
import { lineFetch } from "../apis/client"
import type { LineAuthValue } from "../schema"

const LOADING_SECONDS = 5

const sendTyping: ConversationHandlers<LineAuthValue>["sendTyping"] = async ({
  ctx,
  data: { contact, typing },
}) => {
  if (!contact.sourceId) {
    throw new SdkException("Missing chat ID in conversation")
  }
  if (!typing) {
    return
  }
  await lineFetch<unknown>(ctx.auth, {
    method: "POST",
    path: "/v2/bot/chat/loading/start",
    body: { chatId: contact.sourceId, loadingSeconds: LOADING_SECONDS },
  })
}

export const conversationHandlers = { sendTyping }
