import type { DatabaseClient } from "@chatbotx.io/database/client"
import { isUniqueViolationError } from "@chatbotx.io/database/client"

const MAX_RETRY_ATTEMPTS = 20

/**
 * Retries `insert` with a numeric suffix appended to whatever name field
 * `insert` closes over, on a unique-constraint violation. A pre-query
 * ("does this name already exist?") is TOCTOU-racy against a concurrent
 * insert from the same install transaction or another install running at
 * the same time — catching the real constraint violation is the only sound
 * check. Bounded by `MAX_RETRY_ATTEMPTS`; exhausting it warns and skips
 * rather than looping forever, since a template installing hundreds of
 * same-named resources is not a case worth optimizing for.
 *
 * Each attempt runs inside its own nested transaction (a Postgres SAVEPOINT
 * via Drizzle's `tx.transaction()`), because `insert` runs inside the
 * install's single outer transaction — in Postgres a 23505 poisons the whole
 * outer transaction (`25P02 in_failed_sql_transaction`) unless the failing
 * statement is isolated behind its own savepoint that can be rolled back on
 * its own. Without this, the first name collision anywhere in the install
 * rolled back the whole thing instead of suffixing.
 *
 * `constraint` narrows `isUniqueViolationError` to the one unique index this
 * retry is meant to catch, so an unrelated 23505 (a different constraint on
 * the same table) rethrows immediately instead of burning all
 * `MAX_RETRY_ATTEMPTS` and being misreported as a name collision.
 */
export const insertWithNameRetry = async <T>(
  tx: DatabaseClient,
  constraint: string,
  name: string,
  insert: (tx: DatabaseClient, candidateName: string) => Promise<T>,
  onGiveUp: (lastAttemptedName: string) => void,
): Promise<T | undefined> => {
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    const candidateName = attempt === 0 ? name : `${name} (${attempt + 1})`
    try {
      return await tx.transaction((savepointTx) =>
        insert(savepointTx, candidateName),
      )
    } catch (error) {
      if (!isUniqueViolationError(error, constraint)) {
        throw error
      }
      if (attempt === MAX_RETRY_ATTEMPTS - 1) {
        onGiveUp(candidateName)
        return
      }
    }
  }
  return
}
