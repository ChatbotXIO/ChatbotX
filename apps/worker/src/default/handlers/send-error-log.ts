import { db, isForeignKeyViolationError } from "@chatbotx.io/database/client"
import { errorLogModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import type { ErrorLogEntry, JobSendErrorLog } from "@chatbotx.io/worker-config"

type ErrorLogInsert = {
  id: string
  workspaceId: string
  contactId: string | null
  action: string
  detail: string
  httpCode: string | null
}

const toRow = (entry: ErrorLogEntry): ErrorLogInsert => ({
  id: createId(),
  workspaceId: entry.workspaceId,
  contactId: entry.contactId ?? null,
  // `action` is the provider verbatim. The operation name is deliberately
  // not recorded; what was attempted lives in `detail`.
  action: entry.provider,
  // The provider's message, raw and unredacted by explicit product decision.
  // Never a stack: `ErrorLog` is read by workspace users, and older queued
  // entries that still carry `error.stack` are ignored rather than written.
  detail: entry.error.message,
  httpCode: entry.error.httpCode,
})

const insertRow = async (row: ErrorLogInsert) => {
  try {
    await db.insert(errorLogModel).values(row)
  } catch (err) {
    // The contact can be deleted between the failure and this job running.
    // `onDelete: "set null"` does not help an *insert* of an already-deleted
    // id, so this raises a foreign-key violation. Dropping the attribution is
    // strictly better than losing the row: the default-queue catch-all no
    // longer writes a fallback, so a dead-lettered job leaves no trace here.
    //
    // Narrowed to 23503 on purpose. Retrying *any* failure without the contact
    // would silently strip attribution from a row that had nothing wrong with
    // it, whenever the first insert lost a connection or timed out.
    if (row.contactId === null || !isForeignKeyViolationError(err)) {
      throw err
    }
    await db.insert(errorLogModel).values({ ...row, contactId: null })
  }
}

export const sendErrorLog = async (data: JobSendErrorLog["data"]) => {
  const rows = data.entries.map(toRow)
  if (rows.length === 0) {
    return
  }

  // Every `logProviderError` call site enqueues a single entry. Going straight
  // to the per-row path keeps the foreign-key fallback at two round trips
  // instead of three.
  if (rows.length === 1) {
    await insertRow(rows[0])
    return
  }

  try {
    await db.insert(errorLogModel).values(rows)
    return
  } catch {
    // A multi-row insert is all-or-nothing, so one deleted contact would drop
    // the whole batch. Fall back to per-row inserts and let only the offending
    // rows pay the extra round trip.
  }

  // Rows that already landed in the failed batch insert were rolled back with
  // it, so replaying every row here cannot duplicate. A row that fails *again*
  // rethrows once the rest are written, so the job retries rather than
  // silently losing it — that retry can duplicate the rows that did succeed,
  // which is the accepted cost of not losing the failed one.
  const results = await Promise.allSettled(rows.map(insertRow))
  const rejected = results.find((result) => result.status === "rejected")
  if (rejected) {
    throw rejected.reason
  }
}
