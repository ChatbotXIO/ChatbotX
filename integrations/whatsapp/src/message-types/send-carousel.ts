import type { ILogObj, Logger } from "tslog"
import type { SendCardPayload } from "./send-card.js"
import { generateOutgoingMessages as generateSendCarouselOutgoingMessages } from "./send-card.js"

export function* generateOutgoingMessages(
  payload: { cards: SendCardPayload[] },
  logger: Logger<ILogObj>,
) {
  for (const card of payload.cards) {
    for (const m of generateSendCarouselOutgoingMessages(card, logger)) {
      yield m
    }
  }
}
