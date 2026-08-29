/**
 * Shared metadata key threading the originating `ContactInbox.id` from an
 * event producer, through the trigger/webhook queue's `metadata`/`eventData`
 * bag, to the trigger worker's action executor. This closes the "wrong
 * inbox" attribution gap: without it, ads-conversion trigger actions
 * (`trackAdsLead`/`trackAdsPurchase`/`sendMetaCapiEvent`/`startAnotherFlow`)
 * fall back to the contact's most-recently-active inbox across ALL
 * channels instead of the inbox tied to the event that fired the trigger.
 *
 * Both `TriggerEventEmitter` and `WebhookEventEmitter` forward `metadata`
 * verbatim into their queue's `eventData` (see `BaseEventEmitter`), so no new
 * queue field or schema change is needed — the id rides inside the existing
 * bag under this key.
 */
export const CONTACT_INBOX_METADATA_KEY = "contactInboxId"

/**
 * Adds `contactInboxId` to an event's metadata bag, only when a producer
 * actually has one in scope. Omitting `contactInboxId` returns `metadata`
 * completely unchanged (no key added, no new object) so producers that have
 * no `ContactInbox` in scope keep emitting byte-identical metadata.
 */
export function withContactInboxMetadata(
  metadata: Record<string, unknown> | undefined,
  contactInboxId?: string,
): Record<string, unknown> | undefined {
  if (!contactInboxId) {
    return metadata
  }

  return {
    ...(metadata ?? {}),
    [CONTACT_INBOX_METADATA_KEY]: contactInboxId,
  }
}

// `ContactInbox.id` is a numeric snowflake (`bigintAsString`). Only a
// digits-only string can be a real id — anything else (a legacy/replayed job,
// a hand-crafted payload) must NOT reach the bigint `id` predicate in
// `findByIdForContact`, where Postgres would raise an "invalid input syntax
// for type bigint" cast error and fail the whole trigger action instead of
// letting the caller fall back to the most-recent inbox.
const SNOWFLAKE_ID_RE = /^\d+$/

/**
 * Reads `contactInboxId` back out of a trigger event's `eventData` bag.
 * Returns `undefined` for anything that is not a real snowflake id —
 * missing, non-string, empty, or a non-numeric string (older queued jobs
 * emitted before this field existed never carry it; malformed/replayed jobs
 * may carry garbage) — so callers fall back to the contact's
 * most-recently-active inbox rather than hitting a DB cast error.
 */
export function extractContactInboxId(
  eventData: Record<string, unknown> | undefined,
): string | undefined {
  const value = eventData?.[CONTACT_INBOX_METADATA_KEY]
  return typeof value === "string" && SNOWFLAKE_ID_RE.test(value)
    ? value
    : undefined
}
