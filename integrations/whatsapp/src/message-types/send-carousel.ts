import type { ILogObj, Logger } from "tslog"
import type { SendCardPayload } from "./send-card.js"
import { generateOutgoingMessages as generateSendCarouselOutgoingMessages } from "./send-card.js"

export function* generateOutgoingMessages(
  flowVersionId: string,
  payload: { cards: SendCardPayload[] },
  logger: Logger<ILogObj>,
) {
  for (const card of payload.cards) {
    for (const m of generateSendCarouselOutgoingMessages(
      flowVersionId,
      card,
      logger,
    )) {
      yield m
    }
  }
}
