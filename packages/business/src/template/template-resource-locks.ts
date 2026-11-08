import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import type { TemplateResourceKind } from "@chatbotx.io/database/partials"
import { templateInstalledResourceRepository } from "@chatbotx.io/database/repositories/template-installed-resource"
import { sql } from "drizzle-orm"
import { ChatbotXException } from "../errors"

/**
 * The per-resource lock protocol shared by every writer of a
 * template-installed resource: a local editor (via `assertEditable`), a sync,
 * a restore, the uninstall, and every writer that only points at one (via
 * `assertReferencable`). All of them lock
 * `hashtextextended('tpl-res:' || kind || ':' || id, 0)` and take their WHOLE
 * key set in ONE sorted pass, `(kind, resourceId)`, so lock order is global
 * and no wait cycle can form.
 *
 * Two modes, a readers-writer lock per resource. A writer that changes or
 * removes the resource takes it `exclusive`. A writer that only adds a
 * reference to it through `assertReferencable` (a deal in an installed
 * pipeline, a ref link pointing at an installed flow) takes it `shared`, and
 * so does a sync for a manifest resource it only reads: those never wait for
 * each other, which keeps contact-scale writers parallel, and still wait for
 * (and are waited on by) the uninstall that decides whether the resource is
 * kept.
 *
 * A key is never acquired, nor raised from `shared` to `exclusive`, after the
 * transaction's first lock set: two transactions each raising a shared lock
 * they both hold would deadlock. A caller that discovers it needs more gets a
 * `TemplateLockSetGrownError`; `withTemplateLockedTransaction` rolls back and
 * retries with the union taken up front, at most `MAX_ATTEMPTS` times.
 */

export type TemplateLockKey = {
  kind: TemplateResourceKind
  resourceId: string
}

/** `shared` for a writer that only references the resource; `exclusive` for one that changes it. */
export type TemplateLockMode = "shared" | "exclusive"

export type TemplateLockRequest = TemplateLockKey & { mode: TemplateLockMode }

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

const strongerMode = (
  a: TemplateLockMode,
  b: TemplateLockMode,
): TemplateLockMode =>
  a === "exclusive" || b === "exclusive" ? "exclusive" : "shared"

/**
 * De-duplicated and sorted like `sortTemplateLockKeys`; a key requested in
 * both modes is taken `exclusive`.
 */
const mergeTemplateLockRequests = (
  requests: readonly TemplateLockRequest[],
): TemplateLockRequest[] => {
  const merged = new Map<string, TemplateLockRequest>()
  for (const request of requests) {
    const text = keyText(request)
    const held = merged.get(text)
    merged.set(text, {
      kind: request.kind,
      resourceId: request.resourceId,
      mode: held ? strongerMode(held.mode, request.mode) : request.mode,
    })
  }
  return [...merged.values()].sort(compareKeys)
}

const withMode = (
  keys: readonly TemplateLockKey[],
  mode: TemplateLockMode,
): TemplateLockRequest[] =>
  keys.map((key) => ({ kind: key.kind, resourceId: key.resourceId, mode }))

/** The transaction needs a lock it does not hold yet; roll back and retry with `keys` taken first. */
export class TemplateLockSetGrownError extends Error {
  readonly keys: readonly TemplateLockRequest[]
  constructor(keys: readonly TemplateLockRequest[]) {
    super("The template lock set grew while the transaction was running")
    this.name = "TemplateLockSetGrownError"
    this.keys = keys
  }
}

const templateLockContentionException = () =>
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
  held?: Map<string, TemplateLockRequest>
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

/** Whether a held lock already covers `request`: the same key, in a mode at least as strong. */
const covers = (
  held: TemplateLockRequest | undefined,
  request: TemplateLockRequest,
): boolean =>
  held !== undefined && (held.mode === "exclusive" || request.mode === "shared")

/**
 * Takes the `tpl-res:` locks for `requests`, sorted, in `tx`, each in its
 * mode. The first call in a transaction acquires; a later call whose
 * requests are all covered is a no-op; a later call that needs a new key, or
 * `exclusive` on a key held `shared`, throws `TemplateLockSetGrownError` (the
 * caller's `withTemplateLockedTransaction` retries with the union) instead of
 * taking it late, because a lower-sorted key acquired after a higher one, or
 * two transactions raising the same shared lock, is how a deadlock forms.
 */
export const acquireTemplateResourceLockRequests = async (
  tx: DatabaseClient,
  requests: readonly TemplateLockRequest[],
): Promise<void> => {
  const wanted = mergeTemplateLockRequests(requests)
  const state = stateOf(tx)
  if (state.held) {
    const held = state.held
    const missing = wanted.filter(
      (request) => !covers(held.get(keyText(request)), request),
    )
    if (missing.length === 0) {
      return
    }
    throw new TemplateLockSetGrownError(
      mergeTemplateLockRequests([...held.values(), ...missing]),
    )
  }
  if (wanted.length === 0) {
    return
  }
  state.held = new Map(
    wanted.map((request) => [keyText(request), request] as const),
  )
  // ONE statement. `wanted` is already in the global order; WITH ORDINALITY
  // plus the OFFSET 0 fence keeps that order, and the lock call sits in the
  // outer projection, so it runs once per row as the sorted subquery yields
  // it (no planner reordering of a volatile call past the sort).
  const texts = sql.join(
    wanted.map((request) => sql`${keyText(request)}`),
    sql`, `,
  )
  const shared = sql.join(
    wanted.map((request) => sql`${request.mode === "shared"}`),
    sql`, `,
  )
  await tx.execute(
    sql`select case when ordered.shared then pg_advisory_xact_lock_shared(hashtextextended(ordered.k, 0)) else pg_advisory_xact_lock(hashtextextended(ordered.k, 0)) end from (select u.k, u.shared, u.n from unnest(array[${texts}]::text[], array[${shared}]::boolean[]) with ordinality as u(k, shared, n) order by u.n offset 0) as ordered`,
  )
}

/** `acquireTemplateResourceLockRequests` with every key in one `mode` (`exclusive` unless said otherwise). */
export const acquireTemplateResourceLocks = async (
  tx: DatabaseClient,
  keys: readonly TemplateLockKey[],
  mode: TemplateLockMode = "exclusive",
): Promise<void> =>
  await acquireTemplateResourceLockRequests(tx, withMode(keys, mode))

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
  let requests = mergeTemplateLockRequests(
    withMode(options.initialKeys ?? [], "exclusive"),
  )
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await database.transaction(async (tx) => {
        await options.prepare?.(tx)
        if (requests.length > 0) {
          // A local writer names its workspace so only a resource a template
          // actually installed is locked; the engine's own paths omit it and
          // lock every key they name.
          const live = options.workspaceId
            ? new Set(
                (
                  await findLiveTemplateKeys(tx, options.workspaceId, requests)
                ).map(keyText),
              )
            : null
          await acquireTemplateResourceLockRequests(
            tx,
            live
              ? requests.filter((request) => live.has(keyText(request)))
              : requests,
          )
        }
        return await callback(tx)
      })
    } catch (error) {
      if (!(error instanceof TemplateLockSetGrownError)) {
        throw error
      }
      requests = mergeTemplateLockRequests([...requests, ...error.keys])
    }
  }
  throw templateLockContentionException()
}
