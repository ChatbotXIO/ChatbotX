import type { DatabaseClient } from "@chatbotx.io/database/client"
import type {
  TemplateCategory,
  TemplateResourceCategory,
} from "@chatbotx.io/database/partials"
import type { ReferenceIdMaps } from "@chatbotx.io/flow-config"

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
  track: (entry: {
    category: TemplateCategory
    resourceKind: string
    resourceId: string
    sourceResourceId: string
    wasExisting: boolean
  }) => void
  warn: (warning: TemplateInstallWarning) => void
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
  entries: (Record<string, unknown> & { sourceId: string })[]
  folderIds: readonly string[]
  productCategoryIds: readonly string[]
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
  resolveIds: (workspaceId: string) => Promise<string[]>
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
 * One category's install behavior. `providesKinds`/`consumesKinds` drive the
 * install-order assertion in `install-order.ts`; `deferredKinds` marks which
 * of `consumesKinds` this adapter is allowed to leave unresolved at insert
 * time (fixed up later via the `PatchTask`s returned from `insert`).
 * `collector` is the export-side counterpart, required so a category can
 * never ship install-only (the gap the plan calls G1) — the registry's
 * `satisfies Record<TemplateResourceCategory, ResourceAdapter>` then makes a
 * category without both directions a compile error.
 */
export type ResourceAdapter = {
  readonly category: TemplateResourceCategory
  readonly providesKinds: readonly string[]
  readonly consumesKinds: readonly string[]
  readonly deferredKinds: readonly string[]
  insert: (
    ctx: TemplateInstallContext,
    entries: readonly (Record<string, unknown> & { sourceId: string })[],
  ) => Promise<PatchTask[]>
  collector: ResourceCollector
}

export const idMapsSnapshot = (
  idMaps: Record<string, Map<string, string>>,
): ReferenceIdMaps => idMaps
