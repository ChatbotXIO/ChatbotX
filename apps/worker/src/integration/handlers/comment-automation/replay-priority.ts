import { AsyncLocalStorage } from "node:async_hooks"
import { MISSED_COMMENT_REPLAY_PRIORITY } from "@chatbotx.io/worker-config"
import type { JobsOptions } from "bullmq"

/**
 * Marks the async work of one missed-comment replay. A replay run can queue
 * thousands of comments, and everything they send — replies, DMs, flows, AI
 * replies, hide/unhide — goes through the same `chat`, `integration` and
 * `aiAgent` queues as live customer traffic. Carrying the marker in async
 * context (like `setWebhookExecutionContext`) lets every enqueue site lower its
 * priority without threading a flag through each reply helper.
 */
const missedCommentReplayStorage = new AsyncLocalStorage<true>()

export function runAsMissedCommentReplay<T>(callback: () => Promise<T>) {
  return missedCommentReplayStorage.run(true, callback)
}

/**
 * The given job options, with `MISSED_COMMENT_REPLAY_PRIORITY` added inside a
 * replay. BullMQ runs every unprioritized job first, so a replay's sends always
 * yield to live traffic. Outside a replay the options are returned untouched.
 */
export function withReplayPriority(
  options?: JobsOptions,
): JobsOptions | undefined {
  if (!missedCommentReplayStorage.getStore()) {
    return options
  }
  return { ...options, priority: MISSED_COMMENT_REPLAY_PRIORITY }
}
