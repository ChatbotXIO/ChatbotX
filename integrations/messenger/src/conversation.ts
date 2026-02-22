import {
  type AgentMarkAsReadProps,
  SdkException,
  type SendTypingProps,
} from "@aha.chat/sdk"
import { sendPageMessage } from "./apis/page"
import type { MessengerAuthValue } from "./schemas"

export const sendTyping = async (
  props: SendTypingProps<MessengerAuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { conversation, typing },
  } = props

  const recipientId = conversation.sourceId

  if (!recipientId) {
    throw new SdkException("Missing recipient ID in conversation")
  }

  await sendPageMessage(ctx.auth, {
    recipient: { id: recipientId },
    sender_action: typing ? "typing_on" : "typing_off",
  })
}

export const agentMarkAsRead = async (
  props: AgentMarkAsReadProps<MessengerAuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { conversation },
  } = props

  const recipientId = conversation.sourceId
  if (!recipientId) {
    throw new SdkException("Missing recipient ID in conversation")
  }

  await sendPageMessage(ctx.auth, {
    recipient: { id: recipientId },
    sender_action: "mark_seen",
  })
}
