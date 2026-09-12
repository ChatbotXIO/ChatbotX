import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  mapToChannelError,
  readWhatsappOriginErrorDetail,
} from "@chatbotx.io/integration-whatsapp"

/**
 * Picks the most helpful sentence Meta sent back for a failed Graph call.
 * `error_user_msg` explains the actual reason ("Calling APIs cannot be
 * enabled for this phone number."), while the top-level `message` is often
 * just a label ("Calling cannot be enabled") — so prefer the former.
 */
function buildWhatsappApiActionErrorMessage(
  error: unknown,
  fallbackMessage: string,
): string {
  const channelError = mapToChannelError(error)
  const originError = readWhatsappOriginErrorDetail(
    channelError.getOriginError(),
  )

  return (
    originError.userMessage ||
    originError.userTitle ||
    channelError.message ||
    fallbackMessage
  )
}

/** Re-throws a WhatsApp API failure as the sentence the toast should show. */
export function throwWhatsappApiActionError(
  error: unknown,
  fallbackMessage: string,
): never {
  throw new ChatbotXException(
    buildWhatsappApiActionErrorMessage(error, fallbackMessage),
  )
}
