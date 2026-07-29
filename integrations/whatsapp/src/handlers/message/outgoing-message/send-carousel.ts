import type { ClientMessage } from "whatsapp-api-js/types"
import type { InteractiveCarouselMessage } from "../../../schema"
import {
  buildInteractiveCarouselMessages,
  CAROUSEL_MIN_CARDS,
} from "./interactive-carousel"
import {
  generateOutgoingMessages as generateCardOutgoingMessages,
  type SendCardPayload,
  type SendCardProps,
} from "./send-card"

export function* generateOutgoingMessages(
  props: Omit<SendCardProps, "payload"> & {
    payload: { cards: SendCardPayload[] }
  },
): Generator<ClientMessage | InteractiveCarouselMessage> {
  if (props.payload.cards.length >= CAROUSEL_MIN_CARDS) {
    yield* buildInteractiveCarouselMessages({
      cards: props.payload.cards,
      flowId: props.flowId,
      flowVersionId: props.flowVersionId,
      metadata: props.metadata,
    })
    return
  }

  for (const [index, card] of props.payload.cards.entries()) {
    const isLastCard = index === props.payload.cards.length - 1

    // One-card "Card" steps predate Meta's 2-card carousel minimum. Preserve
    // their legacy rendering and keep node quick replies attached.
    yield* generateCardOutgoingMessages({
      flowId: props.flowId,
      flowVersionId: props.flowVersionId,
      metadata: props.metadata,
      quickReplies: isLastCard ? props.quickReplies : undefined,
      payload: card,
    })
  }
}
