import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { TemplateResourceKind } from "@chatbotx.io/database/partials"
import { templateInstalledResourceRepository } from "@chatbotx.io/database/repositories/template-installed-resource"
import { sql } from "drizzle-orm"
import { ChatbotXException } from "../errors"

/**
 * The per-resource lock protocol shared by every writer of a
 * template-installed resource: a local editor (via `assertEditable`), a sync,
 * a restore and the uninstall. All of them serialize on
 * `pg_advisory_xact_lock(hashtextextended('tpl-res:' || kind || ':' || id, 0))`
 * and take their WHOLE key set in ONE sorted pass, `(kind, resourceId)`, so
 * lock order is global and no wait cycle can form.
 *
 * A key is never acquired after another one in the same transaction. A
 * caller that discovers it needs a key it does not hold (a referenced parent
 * resolved differently once the locks were taken) gets a
 * `TemplateLockSetGrownError`; `withTemplateLockedTransaction` rolls back and
 * retries with the union taken up front, at most `MAX_ATTEMPTS` times.
 */

export type TemplateLockKey = {
  kind: TemplateResourceKind
  resourceId: string
}

const MAX_ATTEMPTS = 3

const keyText = (key: TemplateLockKey): string =>
  `tpl-res:${key.kind}:${key.resourceId}`

const compareKeys = (a: TemplateLockKey, b: TemplateLockKey): number => {
  if (a.kind !== b.kind) {
    return a.kind < b.kind ? -1 : 1
  }
  if (a.resourceId === b.resourceId) {
    return 0
  }
  return a.resourceId < b.resourceId ? -1 : 1
}

/** De-duplicated and sorted by `(kind, resourceId)`: the one global lock order. */
export const sortTemplateLockKeys = (
  keys: readonly TemplateLockKey[],
): TemplateLockKey[] => {
  const unique = new Map(keys.map((key) => [keyText(key), key] as const))
  return [...unique.values()].sort(compareKeys)
}

/** The transaction needs a lock it does not hold yet; roll back and retry with `keys` taken first. */
export class TemplateLockSetGrownError extends Error {
  readonly keys: readonly TemplateLockKey[]
  constructor(keys: readonly TemplateLockKey[]) {
    super("The template lock set grew while the transaction was running")
    this.name = "TemplateLockSetGrownError"
    this.keys = keys
  }
}

export const templateLockContentionException = () =>
  new ChatbotXException(
    "The resource is being changed by another operation; try again",
    "templateLockContention",
    409,
  )

/**
 * What a transaction already holds, and which keys it already resolved as
 * live or not. Keyed by the ROOT transaction's session, not the handle: a
 * drizzle savepoint (`tx.transaction()`) is a new handle over the same session
 * and the same Postgres transaction, so it must see the root's locks. Rule:
 * never take a transaction's FIRST lock set inside a savepoint. Postgres
 * releases a lock taken after a savepoint when that savepoint rolls back, but
 * this state would still record it as held.
 */
type TransactionState = {
  held?: Map<string, TemplateLockKey>
  live: Map<string, boolean>
  engine: boolean
}

const transactionStates = new WeakMap<object, TransactionState>()

const stateOf = (tx: DatabaseClient): TransactionState => {
  // The root client is no transaction: its one session outlives every request,
  // so a memo there would leak held locks and liveness across all of them.
  if (tx === db) {
    return { live: new Map(), engine: false }
  }
  // `session` is the driver session a savepoint handle shares with its root.
  const session: unknown = Reflect.get(tx, "session")
  const owner = typeof session === "object" && session !== null ? session : tx
  const existing = transactionStates.get(owner)
  if (existing) {
    return existing
  }
  const created: TransactionState = { live: new Map(), engine: false }
  transactionStates.set(owner, created)
  return created
}

/**
 * The template engine's own transactions (install, sync apply). The copies
 * they reference are created in that same uncommitted transaction, so no other
 * transaction can see, lock or tombstone those ids: the reference guards that
 * protect local editors have nothing to protect there, and taking a lock per
 * newly created copy would grow the lock set mid-transaction.
 */
export const markTemplateEngineTransaction = (tx: DatabaseClient): void => {
  stateOf(tx).engine = true
}

export const isTemplateEngineTransaction = (tx: DatabaseClient): boolean =>
  stateOf(tx).engine

const liveMemoKey = (workspaceId: string, key: TemplateLockKey): string =>
  `${workspaceId}:${keyText(key)}`

/**
 * The keys, among `keys`, that have a live provenance row: ONE indexed
 * statement however many keys and kinds. A key already resolved in this
 * transaction is answered from memory, so a writer whose
 * `withTemplateLockedTransaction` resolved its `initialKeys` pays nothing
 * again when its guard asks for the same keys. Only live keys ever need a
 * lock, a tombstone check or a permission check: a plain workspace pays this
 * one query and nothing else.
 */
export const findLiveTemplateKeys = async (
  tx: DatabaseClient,
  workspaceId: string,
  keys: readonly TemplateLockKey[],
): Promise<TemplateLockKey[]> => {
  const state = stateOf(tx)
  const unique = sortTemplateLockKeys(keys)
  const unknown = unique.filter(
    (key) => !state.live.has(liveMemoKey(workspaceId, key)),
  )
  if (unknown.length > 0) {
    const found = await templateInstalledResourceRepository.findLiveKeys(
      { workspaceId, keys: unknown },
      tx,
    )
    const foundTexts = new Set(found.map(keyText))
    for (const key of unknown) {
      state.live.set(
        liveMemoKey(workspaceId, key),
        foundTexts.has(keyText(key)),
      )
    }
  }
  return unique.filter((key) => state.live.get(liveMemoKey(workspaceId, key)))
}

/**
 * Takes the `tpl-res:` locks for `keys`, sorted, in `tx`. The first call in a
 * transaction acquires; a later call whose keys are all held is a no-op; a
 * later call that needs a new key throws `TemplateLockSetGrownError` (the
 * caller's `withTemplateLockedTransaction` retries with the union) instead of
 * taking it late, because a lower-sorted key acquired after a higher one is
 * how a deadlock cycle forms.
 */
export const acquireTemplateResourceLocks = async (
  tx: DatabaseClient,
  keys: readonly TemplateLockKey[],
): Promise<void> => {
  const wanted = sortTemplateLockKeys(keys)
  const state = stateOf(tx)
  if (state.held) {
    const held = state.held
    const missing = wanted.filter((key) => !held.has(keyText(key)))
    if (missing.length === 0) {
      return
    }
    throw new TemplateLockSetGrownError(
      sortTemplateLockKeys([...held.values(), ...missing]),
    )
  }
  if (wanted.length === 0) {
    return
  }
  state.held = new Map(wanted.map((key) => [keyText(key), key] as const))
  // ONE statement. `wanted` is already in the global order; WITH ORDINALITY
  // plus the OFFSET 0 fence keeps that order, and the lock call sits in the
  // outer projection, so it runs once per row as the sorted subquery yields
  // it (no planner reordering of a volatile call past the sort).
  const texts = sql.join(
    wanted.map((key) => sql`${keyText(key)}`),
    sql`, `,
  )
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(ordered.k, 0)) from (select u.k, u.n from unnest(array[${texts}]::text[]) with ordinality as u(k, n) order by u.n offset 0) as ordered`,
  )
}

/**
 * Runs `callback` in a transaction, retrying (rolled back, with the grown key
 * set acquired first) when a guard inside discovers it needs more locks.
 * `initialKeys` are taken before `callback` runs on every attempt.
 */
export const withTemplateLockedTransaction = async <T>(
  callback: (tx: DatabaseClient) => Promise<T>,
  options: {
    initialKeys?: readonly TemplateLockKey[]
    /**
     * Set by local writers (services): `initialKeys` are then narrowed to the
     * resources that have a live provenance row, in one query, and a plain
     * workspace takes no lock at all. A key discovered later is handled by
     * the grow-and-retry loop.
     */
    workspaceId?: string
    /**
     * Runs first on every attempt, BEFORE any `tpl-res:` lock: the coarser
     * locks (the install-request lock) always come before the per-resource
     * ones, so every writer orders its locks identically.
     */
    prepare?: (tx: DatabaseClient) => Promise<void>
    database?: Pick<typeof db, "transaction">
  } = {},
): Promise<T> => {
  const database = options.database ?? db
  let keys = sortTemplateLockKeys(options.initialKeys ?? [])
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await database.transaction(async (tx) => {
        await options.prepare?.(tx)
        if (keys.length > 0) {
          // A local writer names its workspace so only a resource a template
          // actually installed is locked; the engine's own paths omit it and
          // lock every key they name.
          const toLock = options.workspaceId
            ? await findLiveTemplateKeys(tx, options.workspaceId, keys)
            : keys
          await acquireTemplateResourceLocks(tx, toLock)
        }
        return await callback(tx)
      })
    } catch (error) {
      if (!(error instanceof TemplateLockSetGrownError)) {
        throw error
      }
      keys = sortTemplateLockKeys([...keys, ...error.keys])
    }
  }
  throw templateLockContentionException()
}
