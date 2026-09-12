import { errorLogProviders } from "@chatbotx.io/utils/error-log"
import { z } from "zod"
import type { InferEventMap } from "./type"

export const errorLogEventTypeSchema = z.enum(["error-log:recorded"])
export type ErrorLogEventType = z.infer<typeof errorLogEventTypeSchema>

/**
 * One `ErrorLog` row in flight.
 *
 * Deliberately carries no `occurredAt`. `ErrorLog.createdAt` is a DB default and
 * always was, and a `Date` on an event payload is a trap: `emit` serializes with
 * `JSON.stringify` and the consumer `JSON.parse`s, so a `Date` arrives as a
 * string and never comes back — which is why the dashboard schema has to type
 * its `occurredAt` as `z.union([z.date(), z.string(), z.number()])`.
 */
export const errorLogRecordedPayloadSchema = z.object({
  /**
   * Minted by the producer, not by the writer. The row's primary key travels
   * with the event so a redelivery — a crash between the insert and the `XACK`,
   * or a reclaim of a batch that partly landed — re-inserts the same id and is
   * absorbed by `onConflictDoNothing` instead of duplicating the row.
   */
  id: z.string(),
  workspaceId: z.string(),
  /** Which third party failed. Written verbatim to `ErrorLog.action`. */
  provider: errorLogProviders,
  /**
   * `.optional()` rather than `.nullable()`: `JSON.stringify` drops `undefined`
   * keys, so an absent contact must be absent, not null, to survive the round
   * trip unchanged.
   */
  contactId: z.string().optional(),
  /**
   * The contact's channel-side id (`ContactInbox.sourceId`) — the fallback
   * identity for a failure with no `contactId`. See the column doc on
   * `packages/database/src/schema/error-log.ts` for why that case is the norm.
   *
   * `.optional()` for the same reason as `contactId` above.
   */
  sourceId: z.string().optional(),
  error: z.object({
    /**
     * The provider's message only — never a stack, which travels separately in
     * `stackTrace` below. See `logProviderError` in `@chatbotx.io/business`.
     */
    message: z.string(),
    /**
     * The provider's real HTTP status, or `null` when the failure was not an
     * HTTP error (a thrown `TypeError`, a timeout). Never a fabricated 500.
     */
    httpCode: z.string().nullable(),
    /**
     * Frame lines of the thrown value's stack, message prefix stripped and
     * capped at 2048 chars. Absent when no real stack existed — see
     * `resolveStackFrames` in `@chatbotx.io/utils/error-log`, which the
     * producer applies to the thrown value unless the caller already captured
     * the frames itself (`LogProviderErrorInput.stackTrace`).
     *
     * Developer-only: withheld from every read surface, so it reaches nobody
     * but someone querying the database directly. `.optional()` for the same
     * reason as `contactId` above, which also makes it backward-compatible
     * with payloads already in flight on the stream at deploy time.
     */
    stackTrace: z.string().optional(),
  }),
})

export type ErrorLogRecordedPayload = z.infer<
  typeof errorLogRecordedPayloadSchema
>

export const errorLogEventSchemas = {
  [errorLogEventTypeSchema.enum["error-log:recorded"]]:
    errorLogRecordedPayloadSchema,
} as const

export type ErrorLogEventMap = InferEventMap<typeof errorLogEventSchemas>
