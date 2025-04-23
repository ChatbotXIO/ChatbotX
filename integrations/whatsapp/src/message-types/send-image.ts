import { Image } from "whatsapp-api-js/messages"
import type { ILogObj, Logger } from "tslog"

export function* generateOutgoingMessages(
  payload: { url: string; buttons: { id: string; label: string }[] },
  _logger: Logger<ILogObj>,
) {
  yield new Image(payload.url)
}
