import { sha256Hex } from "@chatbotx.io/utils/crypto"

const IDENTITY_HASH_LENGTH = 32

type TransactionIdScope = {
  workspaceId: string
  conversionCustomerId: string
  conversionActionId: string
}

export type TransactionIdInput = TransactionIdScope &
  (
    | { mode: "click"; clickId: string }
    | { mode: "id"; dedupId: string }
    | { mode: "event"; occurrenceKey: string }
  )

const SEGMENTS = { click: "c", id: "i", event: "e" } as const

const keyOf = (input: TransactionIdInput): string => {
  switch (input.mode) {
    case "id":
      return input.dedupId
    case "event":
      return input.occurrenceKey
    default:
      return input.clickId
  }
}

/**
 * Deterministic Google `transactionId`, never derived from wall-clock time or
 * a random value, so retries, redrives, reruns and duplicate webhooks collapse
 * onto one event. Google scopes the id per conversion action; the workspace +
 * Google Ads account namespace keeps two workspaces uploading to a shared
 * action from dropping each other's conversions. `click` mode is one per click
 * and action; `id` mode is one per business ID and action; `event` mode is one
 * per occurrence key, which the PRODUCER must make stable across its own
 * retries (a queue job id plus the step or action, never a fresh UUID).
 */
export const buildTransactionId = async (
  input: TransactionIdInput,
): Promise<string> => {
  const segment = SEGMENTS[input.mode]
  const key = keyOf(input)
  const namespace = `${input.workspaceId}:${input.conversionCustomerId}`
  const hash = (await sha256Hex(`${namespace}:${key}`)).slice(
    0,
    IDENTITY_HASH_LENGTH,
  )
  return `gads-v2-${input.conversionActionId}-${segment}-${hash}`
}
