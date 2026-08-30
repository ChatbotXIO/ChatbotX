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

/**
 * The `willRetry` to stamp on the `message:failed` this failure is about to
 * emit — whether another `message:failed` for the *same* send is still to come.
 * The error-log listener records a send on its last emission only, so getting
 * this wrong either loses the failure or writes it twice.
 *
 * `willRetryOnThrow` is the caller's promise that rethrowing produces another
 * emission: a BullMQ attempt still in hand, or a wrapping caller that catches
 * and re-emits (`sendFlowStep`). Rethrowing is the condition — a suppressed
 * error is swallowed instead, so nothing downstream ever sees it, and a
 * Messenger `NETWORK_ERROR` takes that path on its very first attempt.
 */
export function willSendRetry(props: {
  error: unknown
  channel: string
  willRetryOnThrow: boolean
}): boolean {
  if (!props.willRetryOnThrow) {
    return false
  }
  return !shouldSuppressRetryableChannelError(props.error, props.channel)
}
