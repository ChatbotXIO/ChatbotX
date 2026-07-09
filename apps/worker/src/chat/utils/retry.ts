import { channelTypes } from "@chatbotx.io/database/partials"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"

// messenger/instagram sends (comments, private replies) are non-idempotent —
// a BullMQ retry after a transient failure re-dispatches the same send and
// can create a duplicate live reply. Other channels don't share that risk.
const NO_QUEUE_RETRY_CHANNELS = new Set<string>([
  channelTypes.enum.messenger,
  channelTypes.enum.instagram,
])

// Only NETWORK_ERROR leaves the outcome ambiguous (request may or may not
// have reached the provider). RATE_LIMITED means the provider definitely
// rejected the send, so it's still safe — and useful — to retry.
const AMBIGUOUS_OUTCOME_CATEGORIES = new Set<ChannelErrorCategory>([
  ChannelErrorCategory.NETWORK_ERROR,
])

export function shouldSuppressRetryableChannelError(
  error: unknown,
  channel: string,
): boolean {
  if (!(error instanceof ChannelError)) {
    return false
  }
  if (!error.isRetryable) {
    return true
  }
  return (
    NO_QUEUE_RETRY_CHANNELS.has(channel) &&
    AMBIGUOUS_OUTCOME_CATEGORIES.has(error.category)
  )
}
