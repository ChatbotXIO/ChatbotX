/**
 * Helpers for tests that race real transactions on Postgres: a gate the test
 * opens, a bounded wait that fails instead of hanging, and a poll for "some
 * session now waits on an advisory lock" (a condition, never a sleep the
 * outcome depends on).
 */
import { db, sql } from "@chatbotx.io/database/client"

const WAIT_ATTEMPTS = 400
const WAIT_STEP_MS = 25

/** A promise whose resolution the test controls: one writer's gate. */
export const barrier = (): { promise: Promise<void>; open: () => void } => {
  let open: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

/** Rejects when `promise` has not settled within `ms`: a lock regression fails fast instead of hanging. */
export const within = async <T>(
  promise: Promise<T>,
  ms = 10_000,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`still pending after ${ms}ms`)),
          ms,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Resolves once `held` does, and rejects if `done` (the transaction holding
 * it) settles first: a writer that fails before it holds its lock fails the
 * wait instead of leaving it pending.
 */
export const heldBy = async (
  held: Promise<void>,
  done: Promise<unknown>,
): Promise<void> =>
  await Promise.race([
    held,
    done.then(() => {
      throw new Error("the transaction finished before it held its lock")
    }),
  ])

/**
 * Polls Postgres until a session of THIS database waits on an advisory lock
 * (`pg_locks` spans the whole cluster) — on `key`'s lock when given, the
 * `tpl-res:` text hashed the way the lock protocol hashes it: the competing
 * writer reached that lock, not some unrelated one.
 */
export const waitUntilSomeoneWaitsOnAnAdvisoryLock = async (
  key?: string,
): Promise<void> => {
  const onKey = key
    ? sql`and objsubid = 1 and ((classid::bigint << 32) | objid::bigint) = hashtextextended(${key}, 0)`
    : sql``
  for (let attempt = 0; attempt < WAIT_ATTEMPTS; attempt++) {
    const result = await db.execute(
      sql`select count(*)::int as waiting from pg_locks where locktype = 'advisory' and not granted and database = (select oid from pg_database where datname = current_database()) ${onKey}`,
    )
    if (Number((result.rows[0] as { waiting: number }).waiting) > 0) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_STEP_MS))
  }
  throw new Error(`no session ever waited on the advisory lock ${key ?? ""}`)
}
