import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { TemplateResourceKind } from "@chatbotx.io/database/partials"
import {
  templateInstalledResourceRepository,
  templateUninstallRepository,
} from "@chatbotx.io/database/repositories/template-installed-resource"
import { ChatbotXException } from "../errors"
import { TEMPLATE_LOCKED_CONTENT_KEYS } from "./lock-policy"
import { templateUninstallInProgressException } from "./template-errors"
import {
  acquireTemplateResourceLocks,
  findLiveTemplateKeys,
  isTemplateEngineTransaction,
  type TemplateLockKey,
  withTemplateLockedTransaction,
} from "./template-resource-locks"

export const templateAllowDeleteViolationException = () =>
  new ChatbotXException(
    "This resource was installed from a template that disallows deletion",
    "templateAllowDeleteViolation",
  )

export const templateAllowEditViolationException = () =>
  new ChatbotXException(
    "This resource was installed from a template that disallows editing",
    "templateAllowEditViolation",
    403,
  )

type ResourceGuardInput = {
  workspaceId: string
  resourceKind: TemplateResourceKind
  resourceIds: readonly string[]
  tx?: DatabaseClient
  /** Installations whose locks do not count (the one being uninstalled). */
  excludeInstallationIds?: readonly string[]
}

/**
 * An edit guard always runs on a transaction: the `tpl-res:` advisory locks are
 * transaction-scoped, so a bare client would release them at statement end and
 * the guard would not serialize against a sync, restore or uninstall.
 */
type EditGuardInput = ResourceGuardInput & { tx: DatabaseClient }

const keysOf = (
  resourceKind: TemplateResourceKind,
  resourceIds: readonly string[],
): TemplateLockKey[] =>
  resourceIds.map((resourceId) => ({ kind: resourceKind, resourceId }))

/**
 * The delete guard's live-key lookup: on a transaction it shares the
 * transaction's resolved-keys memory, otherwise it is the one statement.
 */
const findLiveKeys = async (
  input: { workspaceId: string; tx?: DatabaseClient },
  keys: readonly TemplateLockKey[],
): Promise<TemplateLockKey[]> =>
  input.tx
    ? await findLiveTemplateKeys(input.tx, input.workspaceId, keys)
    : await templateInstalledResourceRepository.findLiveKeys({
        workspaceId: input.workspaceId,
        keys,
      })

/**
 * Enforces a template-installed copy's `allowDelete` for a category's delete
 * path. A resource nobody installed costs ONE indexed query (the live-key
 * lookup); only a live id is checked with `findBlocking`. A reused row
 * (`wasExisting`), a detached copy, and a copy whose source template was
 * deleted never block, and an id with no provenance row is treated as already
 * gone, not blocked.
 *
 * Called from every affected category's own delete path through
 * `withDeleteGuard` - this function only decides yes/no, it never performs the
 * delete itself.
 */
export const assertDeletable = async (
  input: ResourceGuardInput,
): Promise<void> => {
  const live = await findLiveKeys(
    input,
    keysOf(input.resourceKind, input.resourceIds),
  )
  if (live.length === 0) {
    return
  }
  const blocking = await templateInstalledResourceRepository.findBlocking(
    {
      ...input,
      resourceIds: live.map((key) => key.resourceId),
      permission: "allowDelete",
    },
    input.tx,
  )
  if (blocking.length > 0) {
    throw templateAllowDeleteViolationException()
  }
}

type DeleteTarget = {
  resourceKind: TemplateResourceKind
  resourceIds: readonly string[]
}

/**
 * The one pattern for a delete path: inside a transaction, take the `tpl-res:`
 * locks of the targets that are template-installed, run `assertDeletable` for
 * each, then run `run` (the delete) in that same transaction so the lock is
 * held through the write and the delete serializes against a sync, restore or
 * uninstall exactly like an edit. Pass `tx` to join a transaction the caller
 * already opened; otherwise one is opened here. Several targets (a flow and the
 * reflinks that cascade with it) are locked in one sorted pass. `run` must only
 * do transactional work: it is re-run when the lock set grows.
 */
export const withDeleteGuard = async <T>(
  input: {
    workspaceId: string
    targets: readonly DeleteTarget[]
    tx?: DatabaseClient
    /** An uninstall's own installations: their locks stop governing once it commits. */
    excludeInstallationIds?: readonly string[]
  },
  run: (tx: DatabaseClient) => Promise<T>,
): Promise<T> => {
  const guard = async (tx: DatabaseClient): Promise<void> => {
    const live = await findLiveTemplateKeys(
      tx,
      input.workspaceId,
      input.targets.flatMap((target) =>
        keysOf(target.resourceKind, target.resourceIds),
      ),
    )
    if (live.length === 0) {
      return
    }
    await acquireTemplateResourceLocks(tx, live)
    for (const target of input.targets) {
      await assertDeletable({
        workspaceId: input.workspaceId,
        resourceKind: target.resourceKind,
        resourceIds: target.resourceIds,
        tx,
        excludeInstallationIds: input.excludeInstallationIds,
      })
    }
  }
  if (input.tx) {
    await guard(input.tx)
    return await run(input.tx)
  }
  return await withTemplateLockedTransaction(async (tx) => {
    await guard(tx)
    return await run(tx)
  })
}

/**
 * Field-aware guard for content writes. `changedKeys` are the fields the write
 * touches and `lockedContentKeys` the kind's content fields
 * (`TEMPLATE_LOCKED_CONTENT_KEYS`): a write that touches none of them - a
 * toggle, a folder move, a runtime value - skips the permission check, and a
 * resource nobody installed costs ONE indexed query (the live-key lookup, which
 * `withTemplateLockedTransaction` may already have answered): no lock,
 * tombstone or permission query follows. The per-keystroke autosave of a
 * normal workspace therefore stays one cheap lookup.
 *
 * Guards live in services, never in repositories: install adapters write
 * through repositories directly and must not be blocked by their own locks.
 */
export const assertEditable = async (
  input: EditGuardInput & {
    changedKeys: readonly string[]
    lockedContentKeys: readonly string[]
    /**
     * Resources the write payload references (a flow id, a category id...).
     * They are locked together with the resource, in the same sorted pass,
     * when they are template-installed.
     */
    referencedParents?: readonly TemplateLockKey[]
  },
): Promise<void> => {
  const touchesLockedContent = input.changedKeys.some((key) =>
    input.lockedContentKeys.includes(key),
  )
  const live = await findLiveTemplateKeys(input.tx, input.workspaceId, [
    ...keysOf(input.resourceKind, input.resourceIds),
    ...(input.referencedParents ?? []),
  ])
  if (live.length === 0) {
    return
  }
  // Lock first, then look: a tombstone or permission read under the copies'
  // locks cannot be overtaken by a sync, restore or uninstall.
  await acquireTemplateResourceLocks(input.tx, live)
  // Under the lock a tombstoned copy rejects EVERY write (toggles included):
  // the uninstall already froze it, and a toggle must not undo that.
  await assertNotTombstoned({
    workspaceId: input.workspaceId,
    tx: input.tx,
    keys: live,
  })
  if (!touchesLockedContent) {
    return
  }
  const own = new Set(input.resourceIds)
  const liveOwnIds = live
    .filter((key) => key.kind === input.resourceKind && own.has(key.resourceId))
    .map((key) => key.resourceId)
  const blocking = await templateInstalledResourceRepository.findBlocking(
    { ...input, resourceIds: liveOwnIds, permission: "allowEdit" },
    input.tx,
  )
  if (blocking.length > 0) {
    throw templateAllowEditViolationException()
  }
}

/** The copy (or a parent the write points at) is being uninstalled. */
const assertNotTombstoned = async (input: {
  workspaceId: string
  tx: DatabaseClient
  keys: readonly TemplateLockKey[]
}): Promise<void> => {
  const byKind = new Map<TemplateResourceKind, string[]>()
  for (const key of input.keys) {
    byKind.set(key.kind, [...(byKind.get(key.kind) ?? []), key.resourceId])
  }
  for (const [resourceKind, resourceIds] of byKind) {
    const tombstoned = await templateUninstallRepository.findTombstoned(
      { workspaceId: input.workspaceId, resourceKind, resourceIds },
      input.tx,
    )
    if (tombstoned.length > 0) {
      throw templateUninstallInProgressException()
    }
  }
}

/**
 * The shared guard for every create/update path of an inbound reference (a
 * reflink, keyword, trigger, ... that points at a parent): takes the
 * referenced parents' `tpl-res:` locks, then rejects a parent an uninstall has
 * tombstoned. Either the reference commits first (and the uninstall's Phase A,
 * which waits on the parent lock, sees it and keeps the parent), or the
 * tombstone commits first and the writer is rejected. Throws
 * `TemplateLockSetGrownError` when the transaction holds a different set.
 */
export const assertReferencable = async (input: {
  workspaceId: string
  /** The referenced parents; ids that are not template-installed cost one index lookup. */
  parents: readonly TemplateLockKey[]
  tx: DatabaseClient
}): Promise<void> => {
  if (input.parents.length === 0 || isTemplateEngineTransaction(input.tx)) {
    return
  }
  const live = await findLiveTemplateKeys(
    input.tx,
    input.workspaceId,
    input.parents,
  )
  if (live.length === 0) {
    return
  }
  await acquireTemplateResourceLocks(input.tx, live)
  await assertNotTombstoned({
    workspaceId: input.workspaceId,
    tx: input.tx,
    keys: live,
  })
}

/**
 * Whether any of `resourceIds` has a live provenance row. Inside a guarded
 * transaction whose keys the guard already resolved this is answered from
 * memory, so a write path can skip work only an installed copy needs (the
 * before/after stored reads behind `changedStoredContentKeys`).
 */
export const isTemplateInstalled = async (input: {
  workspaceId: string
  resourceKind: TemplateResourceKind
  resourceIds: readonly string[]
  tx: DatabaseClient
}): Promise<boolean> =>
  (
    await findLiveTemplateKeys(
      input.tx,
      input.workspaceId,
      keysOf(input.resourceKind, input.resourceIds),
    )
  ).length > 0

/**
 * The common shape of a guarded update, as ONE helper: lock the resource (and
 * the parents the write points at) in a transaction, `load` its stored row
 * under the lock, run the edit guard on the keys that `changedKeys` reports for
 * it, then `write` in the same transaction. `load` throws the service's own
 * not-found error.
 *
 * Which `changedKeys` strategy to use:
 * - `changedKeysOf(stored, patch)` for a PATCH: the submitted fields whose value
 *   differs from the loaded row (a form re-sends every field, so guarding on
 *   the submitted keys would block an installer-owned edit).
 * - `changedStoredContentKeys({before, after, ...})` for a FULL-FORM save that
 *   rewrites child rows (a product's variants, a calendar's slots): the
 *   comparison is stored data against stored data, taken before and after the
 *   write in the same locked transaction, so it needs `assertResourceEditable`
 *   called by hand after the write rather than this helper.
 * - A literal list only when the write has no stored value to diff (a stage
 *   bulk edit, a restore): never hand-write `["name"]` plus a manual compare.
 */
export const withEditGuard = async <TLoaded, TResult>(input: {
  workspaceId: string
  resourceKind: TemplateResourceKind
  resourceId: string
  referencedParents?: readonly TemplateLockKey[]
  load: (tx: DatabaseClient) => Promise<TLoaded>
  changedKeys: (loaded: TLoaded) => readonly string[]
  write: (tx: DatabaseClient, loaded: TLoaded) => Promise<TResult>
}): Promise<TResult> =>
  await withTemplateLockedTransaction(
    async (tx) => {
      const loaded = await input.load(tx)
      await assertResourceEditable({
        workspaceId: input.workspaceId,
        resourceKind: input.resourceKind,
        resourceIds: [input.resourceId],
        changedKeys: input.changedKeys(loaded),
        referencedParents: input.referencedParents,
        tx,
      })
      return await input.write(tx, loaded)
    },
    {
      workspaceId: input.workspaceId,
      initialKeys: [
        { kind: input.resourceKind, resourceId: input.resourceId },
        ...(input.referencedParents ?? []),
      ],
    },
  )

/** The ids, among `resourceIds`, whose content is locked: one query per list page for the lock badges. */
export const listLockedIds = async (
  input: ResourceGuardInput,
): Promise<string[]> =>
  await templateInstalledResourceRepository.findBlocking(
    { ...input, permission: "allowEdit" },
    input.tx,
  )

/**
 * `assertEditable` with the kind's content keys looked up from
 * `TEMPLATE_LOCKED_CONTENT_KEYS`, so a service names the kind and the fields
 * its write touches and nothing else.
 */
export const assertResourceEditable = async (
  input: EditGuardInput & {
    changedKeys: readonly string[]
    referencedParents?: readonly TemplateLockKey[]
  },
): Promise<void> =>
  await assertEditable({
    ...input,
    lockedContentKeys: TEMPLATE_LOCKED_CONTENT_KEYS[input.resourceKind],
  })

const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_key, nested: unknown) =>
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? Object.fromEntries(
          Object.entries(nested as Record<string, unknown>).sort(([a], [b]) =>
            a.localeCompare(b),
          ),
        )
      : nested,
  )

/** Row identity and bookkeeping: a rewritten child row gets new ones without changing content. */
const ROW_IDENTITY_KEYS: ReadonlySet<string> = new Set([
  "id",
  "createdAt",
  "updatedAt",
  "deletedAt",
])

/**
 * Comparable content of stored data: identity columns (plus `parentKeys`,
 * e.g. a child row's `calendarId`) dropped at every depth, and child row lists
 * sorted, since a replace-write may return them in another order.
 */
const storedContent = (
  value: unknown,
  parentKeys: ReadonlySet<string>,
): unknown => {
  if (Array.isArray(value)) {
    const items = value.map((item) => storedContent(item, parentKeys))
    // Only a list of child ROWS (each carries its own `id`) is unordered: a
    // replace-write reinserts them, and their read order is not content. A
    // jsonb list (a product's images: the first is the cover) keeps its order.
    const isChildRows = value.some(
      (item) => item && typeof item === "object" && "id" in item,
    )
    return isChildRows ? items.map(stableJson).sort() : items
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !(ROW_IDENTITY_KEYS.has(key) || parentKeys.has(key)))
        .map(([key, nested]) => [key, storedContent(nested, parentKeys)]),
    )
  }
  // An empty text and no text read the same everywhere they are used.
  return value === "" ? null : (value ?? null)
}

/**
 * The locked content keys whose STORED value differs between two reads of one
 * resource, taken in the same locked transaction before and after a write.
 * Comparing stored data with stored data is immune to how a form or the API
 * shapes its input ("" for null, server-filled defaults, child rows without
 * ids), which a diff of the input against the row is not. `keyMap` renames a
 * policy key to the read's property (e.g. a product's `options` →
 * `variantOptions`).
 */
export const changedStoredContentKeys = (input: {
  resourceKind: TemplateResourceKind
  before: Readonly<Record<string, unknown>>
  after: Readonly<Record<string, unknown>>
  parentKeys?: readonly string[]
  keyMap?: Readonly<Record<string, string>>
}): string[] => {
  const parentKeys = new Set(input.parentKeys ?? [])
  return TEMPLATE_LOCKED_CONTENT_KEYS[input.resourceKind].filter((key) => {
    const property = input.keyMap?.[key] ?? key
    return (
      stableJson(storedContent(input.before[property], parentKeys)) !==
      stableJson(storedContent(input.after[property], parentKeys))
    )
  })
}

/**
 * The keys of `patch` whose value differs from the loaded `existing` row. A
 * full-form save submits every field, so guarding on the submitted keys would
 * block an installer-owned edit (a toggle, a domain list) on a locked item;
 * guarding on what actually changed does not. An absent key is not a change.
 */
export const changedKeysOf = (
  existing: Readonly<Record<string, unknown>>,
  patch: Readonly<Record<string, unknown>>,
): string[] =>
  Object.keys(patch).filter(
    (key) =>
      patch[key] !== undefined &&
      // Forms send "" for an empty text the row stores as null: no change.
      stableJson(emptyAsNull(existing[key])) !==
        stableJson(emptyAsNull(patch[key])),
  )

const emptyAsNull = (value: unknown): unknown =>
  value === "" || value === undefined ? null : value
