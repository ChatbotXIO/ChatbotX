import type { ClientMessage } from "whatsapp-api-js/types"
import {
  generateOutgoingMessages as generateCardOutgoingMessages,
  type SendCardPayload,
  type SendCardProps,
} from "./send-card"

export function* generateOutgoingMessages(
  props: Omit<SendCardProps, "payload"> & {
    payload: { cards: SendCardPayload[] }
  },
): Generator<ClientMessage> {
  for (const [index, card] of props.payload.cards.entries()) {
    const isLastCard = index === props.payload.cards.length - 1

    // WhatsApp has no carousel, so the cards arrive as separate messages and
    // the node's quick replies belong to the last one.
    yield* generateCardOutgoingMessages({
      flowId: props.flowId,
      flowVersionId: props.flowVersionId,
      metadata: props.metadata,
      quickReplies: isLastCard ? props.quickReplies : undefined,
      payload: card,
    })
  }
}
