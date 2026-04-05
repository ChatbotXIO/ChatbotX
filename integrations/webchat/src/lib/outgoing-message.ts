import type { SendMessageProps, SendTypingProps } from "@chatbotx.io/sdk"
import ky from "ky"
import type { WebchatAuthValue } from "../schemas"

export const sendTyping = async (
  props: SendTypingProps<WebchatAuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { contactInbox, typing },
  } = props

  await ky
    .post(`${ctx.auth.websocketUrl}/parties/guests/${contactInbox.sourceId}`, {
      headers: {
        "X-API-Key": ctx.auth.apiKey,
      },
      json: {
        eventType: "typing",
        data: {
          typing,
        },
      },
    })
    .json()
}

export const sendMessage = async (
  props: SendMessageProps<WebchatAuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { contactInbox, message },
  } = props

  await ky
    .post(`${ctx.auth.websocketUrl}/parties/guests/${contactInbox.sourceId}`, {
      headers: {
        "X-API-Key": ctx.auth.apiKey,
      },
      json: {
        eventType: "messageCreated",
        data: message,
      },
    })
    .json()
}
