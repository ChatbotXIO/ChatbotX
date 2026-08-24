import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { TemplateCategory } from "@chatbotx.io/database/partials"
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
 * One category's install behavior. `providesKinds`/`consumesKinds` drive the
 * install-order assertion in `install-order.ts`; `deferredKinds` marks which
 * of `consumesKinds` this adapter is allowed to leave unresolved at insert
 * time (fixed up later via the `PatchTask`s returned from `insert`).
 */
export type ResourceAdapter = {
  readonly category: TemplateCategory
  readonly providesKinds: readonly string[]
  readonly consumesKinds: readonly string[]
  readonly deferredKinds: readonly string[]
  insert: (
    ctx: TemplateInstallContext,
    entries: readonly (Record<string, unknown> & { sourceId: string })[],
  ) => Promise<PatchTask[]>
}

export const idMapsSnapshot = (
  idMaps: Record<string, Map<string, string>>,
): ReferenceIdMaps => idMaps
