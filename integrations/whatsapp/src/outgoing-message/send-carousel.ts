import {
  generateOutgoingMessages as generateSendCarouselOutgoingMessages,
  type SendCardPayload,
} from "./send-card"

export function* generateOutgoingMessages(
  flowVersionId: string,
  payload: { cards: SendCardPayload[] },
) {
  for (const card of payload.cards) {
    for (const m of generateSendCarouselOutgoingMessages(flowVersionId, card)) {
      yield m
    }
  }
}
