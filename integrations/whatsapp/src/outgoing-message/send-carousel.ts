import type { ILogObj, Logger } from "@aha.chat/logger"
import {
  generateOutgoingMessages as generateSendCarouselOutgoingMessages,
  type SendCardPayload,
} from "./send-card"

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
