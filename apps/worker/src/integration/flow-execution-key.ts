import { createId } from "@chatbotx.io/utils"

/**
 * A flow execution key is the BullMQ job id (plus its creation time) of the run
 * it belongs to: stable across that job's retries, so a retry is not a new
 * occurrence. A run without a job id gets a random one with one of these
 * prefixes, which a retry would not reproduce.
 */
const RANDOM_KEY_PREFIXES = ["flow-inline-", "integration-job-"] as const

export const mintRandomFlowExecutionKey = (
  prefix: (typeof RANDOM_KEY_PREFIXES)[number],
): string => `${prefix}${createId()}`

/** True when a retry of the run would reproduce `key`. */
export const isDurableFlowExecutionKey = (
  key: string | undefined,
): key is string =>
  Boolean(key) && !RANDOM_KEY_PREFIXES.some((prefix) => key?.startsWith(prefix))
