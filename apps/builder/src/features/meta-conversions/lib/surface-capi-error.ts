import { ChatbotXException } from "@chatbotx.io/business/errors"
import { MetaConversionsException } from "@chatbotx.io/integration-meta-conversions"

/**
 * Surface a Meta Conversions API failure to the user.
 *
 * The safe-action client forwards a `ChatbotXException` message to the toast,
 * so Meta's own message — e.g. "(#200) App does not have
 * instagram_manage_events permission on the Instagram Account" — reaches the
 * user instead of a generic "something went wrong". In the dataset-only (no
 * OAuth) model this message IS the actionable signal: it tells the admin the
 * channel connection is missing the CAPI permission and must be reconnected.
 *
 * Non-Meta errors are rethrown unchanged (they surface as the generic message)
 * unless a translated `fallback` is provided for the validation path.
 */
export function surfaceCapiError(error: unknown, fallback?: string): never {
  if (error instanceof MetaConversionsException) {
    throw new ChatbotXException(error.message)
  }
  if (fallback) {
    throw new ChatbotXException(fallback)
  }
  throw error
}
