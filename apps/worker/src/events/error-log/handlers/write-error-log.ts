import {
  isDatabaseError,
  isForeignKeyViolationError,
} from "@chatbotx.io/database/client"
import type { ErrorLogInsert } from "@chatbotx.io/database/repositories"
import { insertErrorLogs } from "@chatbotx.io/database/repositories"
import type {
  ErrorLogRecordedPayload,
  EventBusMessageMetadata,
} from "@chatbotx.io/event-bus"
import { EVENT_BUS_MESSAGE_ID } from "@chatbotx.io/event-bus"
import { logger } from "../../../lib/logger"

type ErrorLogPayload = ErrorLogRecordedPayload & EventBusMessageMetadata

/**
 * `ErrorLog` has two foreign keys and they need opposite treatment, so neither
 * check may be left unnarrowed: a deleted *contact* is recoverable by dropping
 * the attribution, a deleted *workspace* is not recoverable at all.
 */
const CONTACT_FK = "ErrorLog_contactId_Contact_id_fkey"
const WORKSPACE_FK = "ErrorLog_workspaceId_Workspace_id_fkey"

/**
 * Fields are mapped explicitly, never spread. `attachEventBusMetadata` adds
 * `__eventBusMessageId` to every payload before a listener sees it, and that
 * key must not reach the insert values.
 */
const toRow = (payload: ErrorLogPayload): ErrorLogInsert => ({
  // The producer's id, so a redelivery re-inserts the same key.
  id: payload.id,
  workspaceId: payload.workspaceId,
  contactId: payload.contactId ?? null,
  // `action` is the provider verbatim. The operation name is deliberately
  // not recorded; what was attempted lives in `detail`.
  action: payload.provider,
  // The provider's message, raw and unredacted by explicit product decision.
  // Never a stack: `ErrorLog` is read by workspace users.
  detail: payload.error.message,
  httpCode: payload.error.httpCode,
})

const insertRow = async (row: ErrorLogInsert) => {
  try {
    await insertErrorLogs([row])
  } catch (err) {
    // The contact can be deleted between the failure and this handler running.
    // `onDelete: "set null"` does not help an *insert* of an already-deleted
    // id, so this raises a foreign-key violation. Dropping the attribution is
    // strictly better than losing the row.
    //
    // Narrowed to the contact FK on purpose: retrying *any* violation without
    // the contact would silently strip attribution from a row that had nothing
    // wrong with it, and a deleted-workspace violation would fail identically
    // on the retry.
    if (
      row.contactId === null ||
      !isForeignKeyViolationError(err, CONTACT_FK)
    ) {
      throw err
    }
    await insertErrorLogs([{ ...row, contactId: null }])
  }
}

/**
 * A row that cannot ever be written. Retrying costs five redeliveries — the
 * stream only reclaims entries idle past `claimIdleMs` (180s), so a permanent
 * failure burns ~15 minutes before dead-lettering, and the dead-letter stream
 * has no UI. Better to drop it loudly and ack.
 */
const isPermanentFailure = (err: unknown): boolean =>
  isForeignKeyViolationError(err, WORKSPACE_FK) ||
  // 23502 not-null, 22001 value-too-long: both deterministic on this row.
  (isDatabaseError(err) &&
    (err.cause.code === "23502" || err.cause.code === "22001"))

const messageIdsOf = (payloads: ErrorLogPayload[]): string[] =>
  payloads.flatMap((payload) => {
    const messageId = payload[EVENT_BUS_MESSAGE_ID]
    return typeof messageId === "string" ? [messageId] : []
  })

/**
 * Writes an `ErrorLog` row for every `error-log:recorded` event.
 *
 * The bus runs with `enableSelectiveRetry`, where a *thrown* error marks the
 * whole batch failed and a *returned* `{ failedMessageIds }` marks only those.
 * So this never throws, and reports only failures a retry could actually fix:
 *
 * 1. One multi-row insert. The hot path — one round trip, nothing reported.
 * 2. Only a constraint failure justifies splitting the batch; a connection
 *    error would make N individual inserts fail exactly the same way, so it is
 *    reported wholesale instead.
 * 3. Per-row, a deterministic failure is dropped and a transient one reported.
 */
export async function writeErrorLogs(
  payloads: ErrorLogRecordedPayload[],
  signal?: AbortSignal,
) {
  const events = payloads as ErrorLogPayload[]
  if (events.length === 0) {
    return
  }

  const rows = events.map(toRow)

  try {
    await insertErrorLogs(rows)
    return
  } catch (err) {
    if (!isDatabaseError(err)) {
      // Not a constraint problem — a connection drop, a timeout. Splitting the
      // batch would just repeat the same failure N times.
      logger.error(
        { err, count: rows.length },
        "writeErrorLogs: batch insert failed",
      )
      return { failedMessageIds: messageIdsOf(events) }
    }
  }

  if (signal?.aborted) {
    return { failedMessageIds: messageIdsOf(events) }
  }

  const results = await Promise.allSettled(rows.map(insertRow))
  const failedMessageIds: string[] = []

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      return
    }
    if (isPermanentFailure(result.reason)) {
      logger.warn(
        { err: result.reason, workspaceId: rows[index]?.workspaceId },
        "writeErrorLogs: row permanently unwritable, dropping",
      )
      return
    }
    const messageId = events[index]?.[EVENT_BUS_MESSAGE_ID]
    if (messageId) {
      failedMessageIds.push(messageId)
    }
  })

  return failedMessageIds.length > 0 ? { failedMessageIds } : undefined
}
