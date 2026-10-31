import type { DatabaseClient } from "@chatbotx.io/database/client"
import type {
  FolderType,
  TemplateCategory,
  TemplateResourceCategory,
  TemplateResourceKind,
  TemplateUninstallEffect,
} from "@chatbotx.io/database/partials"
import type { ReferenceIdMaps } from "@chatbotx.io/flow-config"
import type { ResourceFingerprint } from "../fingerprint"
import type { StagingScope } from "../template-object-keys"

/**
 * The outcome of staging one storage object before the apply transaction:
 * either the deterministic key it was copied to, or why it was left out (the
 * `entityKind` of the warning the adapter raises when it inserts the row).
 */
export type StagedObject = { targetPath: string } | { skipped: string }
export type StagedObjects = ReadonlyMap<string, StagedObject>

/**
 * What the staging pre-phase may use: no transaction (it runs before the
 * apply transaction opens), and every copy it makes is recorded so the caller
 * can delete it again if the attempt fails.
 */
export type TemplateStageContext = {
  workspaceId: string
  installationId: string
  /** Which generation (and, for a sync, attempt) the staged keys belong to. */
  scope: StagingScope
  /** The workspace the template was published from; objects it ships must belong to it. */
  sourceWorkspaceId?: string
  trackCopiedObject: (path: string) => void
}

/**
 * A reference an adapter could not resolve at insert time. Surfaced to the
 * installation's `warnings` column — never thrown, since an unresolvable
 * reference should degrade the install to `partial`, not abort it.
 */
export type TemplateInstallWarning = {
  category: TemplateCategory
  entityKind: string
  path: string
  value: string
}

/**
 * A deferred fix-up, drained after every category has been inserted (Phase
 * 2). Exists because the dependency graph between categories is genuinely
 * cyclic (Flow -> AIAgent -> AIFunction -> Flow), so some references cannot
 * be resolved at the moment their owning row is first inserted.
 */
export type PatchTask = {
  category: TemplateCategory
  apply: (ctx: TemplateInstallContext) => Promise<void>
}

/**
 * Mutable state threaded through one install's three phases. `idMaps`
 * accumulates sourceId -> targetId per entity kind as each category (or
 * manifest) resolves its rows, so later categories can remap references
 * into earlier ones (e.g. a flow referencing a customField created in
 * Phase R).
 */
export type TemplateInstallContext = {
  tx: DatabaseClient
  workspaceId: string
  installationId: string
  idMaps: Record<string, Map<string, string>>
  /** `{ sourceInboxId: targetInboxId }` chosen by the installer; validated before the install ran. */
  inboxBindings?: Readonly<Record<string, string>>
  /** The workspace the template was published from; storage objects it ships must belong to it. */
  sourceWorkspaceId?: string
  track: (entry: {
    category: TemplateCategory
    resourceKind: TemplateResourceKind
    resourceId: string
    sourceResourceId: string
    wasExisting: boolean
  }) => void
  warn: (warning: TemplateInstallWarning) => void
  /**
   * Source custom-field name -> the exact name of the target field, filled by
   * the custom-field manifest for every field whose name changed. The install
   * rewrites `{{name}}` tokens in the shipped resources from it.
   */
  customFieldNameBindings?: Map<string, string>
  /**
   * Storage objects the pre-phase already copied (see `stage` on
   * `ResourceAdapter`). Adapters only read it: there is no storage I/O inside
   * the apply transaction.
   */
  staged?: StagedObjects
  /**
   * A sync collects here the flows it published a new version of, so the
   * caller can run the usual after-publish effects once the transaction commits.
   */
  publishedFlows?: { flowId: string; versionId: string }[]
}

/**
 * A row this category's `collect` wants auto-included in another category's
 * selection — the save-time mirror of a deferred install-time reference.
 * E.g. an entryPointLink (Reflink) has a NOT NULL `flowId`, so its collector
 * reports the pointed-at flow here rather than letting `entryPointLinks`
 * install with an unresolvable reference. `buildTemplateSnapshot` folds
 * these into the relevant category's id set before that category's own
 * `collect` runs, so hard dependencies are resolved by construction instead
 * of requiring the export UI to remember to select them.
 */
export type TemplateHardDependency = {
  category: TemplateResourceCategory
  sourceId: string
}

/**
 * One category's `collect` result. `entries` is spread verbatim into
 * `resources[category]` (each entry's own shape is validated later by
 * `parseTemplateExport`, mirroring how `insert` receives loosely-typed
 * entries). `folderIds`/`productCategoryIds` are the real workspace ids this
 * category's rows reference into those two hierarchical manifests —
 * `buildTemplateSnapshot` walks each up to its root and merges the result
 * into `manifests.folders`/`manifests.productCategories`, deduping across
 * categories (a folder or category referenced by two collected categories is
 * only walked once, converging on one manifest entry). Every `sourceId` an
 * entry emits — including these two id lists — is the resource's REAL id in
 * the source workspace: there is no separate id-minting step, since
 * `sourceId` only ever needs to be unique within one export, and
 * workspace-scoped primary keys already are.
 */
export type TemplateCollectResult = {
  entries: readonly TemplateEntry[]
  folderIds: readonly string[]
  productCategoryIds: readonly string[]
  /** Source inboxes the entries are scoped to; shipped as the `inboxes` manifest. */
  inboxIds?: readonly string[]
  hardDependencies: readonly TemplateHardDependency[]
}

/**
 * One category's export-time behavior — the mirror of `insert`.
 * `resolveIds` implements the category's own `mode:"all"` (every current row
 * the workspace owns, subject to whatever soft-delete filter that resource
 * normally uses); `verifyOwnership` is the save-time guard that a caller's
 * explicit `mode:"ids"` selection cannot smuggle in another workspace's rows
 * — both required so ownership/`mode:"all"` support is structural per
 * category rather than an opt-in switch statement someone can forget to
 * extend (the root cause of G10). `collect` does the actual row fetch +
 * shaping into `resources[category]` entries.
 */
export type ResourceCollector = {
  /** `limit` bounds the read; callers pass cap+1 to detect an over-cap selection. */
  resolveIds: (workspaceId: string, limit: number) => Promise<string[]>
  verifyOwnership: (
    workspaceId: string,
    ids: readonly string[],
  ) => Promise<string[]>
  collect: (
    workspaceId: string,
    ids: readonly string[],
  ) => Promise<TemplateCollectResult>
}

/**
 * A shipped entry of any category, as the engine handles it before an adapter
 * narrows it. An adapter is declared `ResourceAdapter<TemplateXEntry>` with the
 * entry type of its own category, so its `stage`/`insert`/`update` read typed
 * entries without a cast.
 */
export type TemplateEntry = Record<string, unknown> & { sourceId: string }

/** An entry of the new template version paired with the installed copy it updates. */
export type SyncPair<E extends TemplateEntry = TemplateEntry> = {
  entry: E
  resourceId: string
}

/**
 * How a category updates an installed copy in place. A category that cannot
 * declares `updateNotSupported`, which the sync reports as `notUpdatable`
 * instead of touching the copy.
 * All methods run inside the sync transaction and write through `tx`
 * directly: the service-level edit guards belong to local editors, and the
 * sync is the one writer allowed past them.
 */
export type ResourceSyncHandler<E extends TemplateEntry = TemplateEntry> = {
  /**
   * `false` for a category the sync cannot update in place (see
   * `updateNotSupported`): it only warns. Absent means updatable.
   */
  readonly updatable?: false
  /**
   * The content of the installed copy that a template update overwrites, in a
   * stable shape, or `null` when the copy is gone. Hashed to tell a copy the
   * installer edited from one the last sync wrote; it must not include
   * installer-owned fields (toggles, folder, runtime counters).
   */
  project: (tx: DatabaseClient, resourceId: string) => Promise<unknown | null>
  /** Everything `update` is about to overwrite, so the installer can restore it. */
  serializeBackup: (
    tx: DatabaseClient,
    resourceId: string,
  ) => Promise<{
    formatVersion: number
    content: Record<string, unknown>
  } | null>
  /**
   * `formatVersion` is the version the backup was serialized with; a handler
   * must refuse one it does not know instead of restoring a misread shape.
   */
  restoreBackup: (
    tx: DatabaseClient,
    resourceId: string,
    content: Record<string, unknown>,
    formatVersion: number,
  ) => Promise<void>
  /** Overwrites the copies with the new entries; references resolve through `ctx.idMaps`. */
  // Method syntax (bivariant): a handler typed to its own category's entry
  // stays assignable to the engine's erased `ResourceSyncHandler`.
  update(
    ctx: TemplateInstallContext,
    pairs: readonly SyncPair<E>[],
  ): Promise<void>
}

/** The producer flags a freeze overwrote, by column key (`{ active: true }`). */
export type FrozenFlags = Record<string, unknown>

/** What an uninstall delete may use. Every write goes through `tx`. */
export type TemplateUninstallContext = {
  tx: DatabaseClient
  workspaceId: string
  /** The kind of the ids being handled (a category such as settings tracks several). */
  kind: TemplateResourceKind
  /** The installation being uninstalled; protections from OTHER installations still apply. */
  installationId: string
  installationIds: readonly string[]
}

/** The ids a delete handled, and the post-commit effects it recorded per id. */
export type TemplateUninstallDeleteResult = {
  deleted: readonly string[]
  /** Ids whose row was already gone: reported as `absent`, not as a failure. */
  absent: readonly string[]
  effects: ReadonlyMap<string, readonly TemplateUninstallEffect[]>
}

/**
 * How a category's copies are removed by an uninstall. Required on every
 * copied-kind adapter: the registry type makes a missing handler a compile
 * error. Every method runs inside the caller's `tx`; effects (cache
 * invalidation, inbox disconnect, events) are returned, never run inline.
 */
export type ResourceUninstallHandler = {
  /**
   * The row's own producers are stopped (inactive/disabled) so nothing new
   * starts while it drains. Returns each row's PRIOR flag values, which the
   * caller stores in the same transaction so `unfreeze` can restore them.
   */
  freeze: (
    tx: DatabaseClient,
    ids: readonly string[],
    ctx: TemplateUninstallContext,
  ) => Promise<ReadonlyMap<string, FrozenFlags>>
  /**
   * Cache drops (and the like) the freeze needs once it commits, so a frozen
   * producer stops at once instead of when its cache expires. Recorded on the
   * rows by Phase A and flushed after its commit.
   */
  freezeEffects?: (workspaceId: string) => readonly TemplateUninstallEffect[]
  /**
   * Gives a kept or cancelled copy its producers back: each flag returns to
   * the stored value, but only where the current value is still the frozen one
   * (an installer who changed it since keeps their choice). Scoped by
   * workspace. Returns the post-commit effects to record (cache drops).
   */
  unfreeze: (
    tx: DatabaseClient,
    rows: readonly { resourceId: string; frozenFrom: FrozenFlags | null }[],
    ctx: TemplateUninstallContext,
  ) => Promise<ReadonlyMap<string, readonly TemplateUninstallEffect[]>>
  /**
   * Called when a committed copy a reference blocked is handed back by a
   * cancel (its drain already removed children): repairs derived state the
   * drain left wrong (an AI file whose run still says completed) and returns
   * post-commit effects to record. Absent when the drain leaves nothing to fix.
   */
  giveBack?: (
    tx: DatabaseClient,
    ids: readonly string[],
    ctx: TemplateUninstallContext,
  ) => Promise<ReadonlyMap<string, readonly TemplateUninstallEffect[]>>
  /**
   * Ids among `ids` that something NOT in `deletingSet` still points at
   * (so deleting them would cascade away or orphan that thing). One batched
   * query per inbound kind, never one per parent.
   */
  protectedDependents: (
    tx: DatabaseClient,
    ids: readonly string[],
    deletingSet: ReadonlySet<string>,
    scope: { workspaceId: string },
  ) => Promise<Set<string>>
  /**
   * The heavy child tables (invariant 24) this kind owns, named for the
   * contract test. Empty only when the kind has none.
   */
  readonly heavyChildren: readonly string[]
  /**
   * Deletes one bounded batch of the heavy children of `ids`; true when more
   * remain. Absent when `heavyChildren` is empty.
   */
  drainHeavyChildren?: (
    tx: DatabaseClient,
    ids: readonly string[],
    ctx: TemplateUninstallContext,
  ) => Promise<boolean>
  /**
   * Deletes the rows through the service delete core (one implementation).
   * Discriminators (keyword `type`, comment-automation channel) are read from
   * the locked row inside `tx`. A missing row is `absent`, not an error.
   */
  uninstallDelete: (
    tx: DatabaseClient,
    ids: readonly string[],
    ctx: TemplateUninstallContext,
  ) => Promise<TemplateUninstallDeleteResult>
}

/**
 * One category's install behavior. `providesKinds`/`consumesKinds` drive the
 * install-order assertion in `install-order.ts`; `deferredKinds` marks which
 * of `consumesKinds` this adapter is allowed to leave unresolved at insert
 * time (fixed up later via the `PatchTask`s returned from `insert`).
 * `collector` is the export-side counterpart, required so a category can
 * never ship install-only (the gap the plan calls G1) — the registry's
 * `satisfies Record<TemplateResourceCategory, ResourceAdapter>` then makes a
 * category without both directions a compile error.
 */
export type ResourceAdapter<E extends TemplateEntry = TemplateEntry> = {
  readonly category: TemplateResourceCategory
  readonly providesKinds: readonly TemplateResourceKind[]
  readonly consumesKinds: readonly string[]
  readonly deferredKinds: readonly string[]
  /**
   * The `resourceKind` this category's copies are tracked under. Not
   * `providesKinds`: that lists only the kinds other adapters consume, and is
   * empty for keywords, webchats, comment automations and entry-point links.
   * `null` means each entry carries its own kind (settings).
   */
  readonly trackedKind: TemplateResourceKind | null
  /** The folder namespaces whose folders belong to this category (provenance only). */
  readonly folderTypes: readonly FolderType[]
  /** The lowest payload `formatVersion` that can carry this category. */
  readonly minFormatVersion: 1 | 2
  /**
   * Copies the storage objects `entries` ship into the installing workspace
   * at deterministic keys, BEFORE the apply transaction opens (storage I/O
   * inside it would hold a connection idle past its timeout). Returns the
   * outcome per entry slot; `insert` only reads it.
   */
  stage?(
    ctx: TemplateStageContext,
    entries: readonly E[],
  ): Promise<Map<string, StagedObject>>
  insert(
    ctx: TemplateInstallContext,
    entries: readonly E[],
  ): Promise<PatchTask[]>
  /**
   * Entries of this category that must exist before ANY category is written
   * (settings' bot fields: `{{bot_field:<id>}}` text in every other category
   * follows the id they resolve to). `earlyEntry` picks them; `insertEarly`
   * writes them, and `insert` is then not given them.
   */
  earlyEntry?: (entry: Record<string, unknown>) => boolean
  insertEarly?(
    ctx: TemplateInstallContext,
    entries: readonly E[],
  ): Promise<void>
  collector: ResourceCollector
  /**
   * How entries of this category are compared for the template's version hash
   * (see `fingerprint.ts`). Absent: the whole entry is hashed as written.
   */
  fingerprint?: ResourceFingerprint
  /** How a sync updates an installed copy; `updateNotSupported(category)` when it cannot. */
  sync: ResourceSyncHandler<E>
}

export const idMapsSnapshot = (
  idMaps: Record<string, Map<string, string>>,
): ReferenceIdMaps => idMaps
