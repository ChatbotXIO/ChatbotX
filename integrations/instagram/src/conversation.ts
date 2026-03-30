import {
  type AgentMarkAsReadProps,
  SdkException,
  type SendTypingProps,
} from "@aha.chat/sdk"
import { sendInstagramMessage } from "./apis/page"
import type { InstagramAuthValue } from "./schemas"

export const sendTyping = async (
  props: SendTypingProps<InstagramAuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { conversation, typing },
  } = props

  const recipientId = conversation.sourceId

  if (!recipientId) {
    throw new SdkException("Missing recipient ID in conversation")
  }

  await sendInstagramMessage(ctx.auth, {
    recipient: { id: recipientId },
    sender_action: typing ? "typing_on" : "typing_off",
    messaging_type: "RESPONSE",
  })
}

export const agentMarkAsRead = async (
  props: AgentMarkAsReadProps<InstagramAuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { conversation },
  } = props

  const recipientId = conversation.sourceId
  if (!recipientId) {
    throw new SdkException("Missing recipient ID in conversation")
  }

  await sendInstagramMessage(ctx.auth, {
    recipient: { id: recipientId },
    sender_action: "mark_seen",
  })
}
