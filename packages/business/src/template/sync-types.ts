import type {
  TemplateCategory,
  TemplateResourceCategory,
  TemplateResourceKind,
} from "@chatbotx.io/database/partials"
import { templateResourceKinds } from "@chatbotx.io/database/partials"
import type {
  TemplateSyncOutcome,
  TemplateSyncRow,
  templateInstallationRepository,
  templateInstallationSyncRepository,
} from "@chatbotx.io/database/repositories"
import type { TemplateExport } from "@chatbotx.io/flow-config"
import {
  TRACKED_KIND_BY_CATEGORY,
  type templateAdapterRegistry,
} from "./adapters/registry"
import type { ResourceSyncHandler, StagedObjects } from "./adapters/types"
import type { createInstallContext } from "./install.service"
import type { TemplateActor } from "./permissions"

export type Entry = Record<string, unknown> & { sourceId: string }

// Derived from the adapter registry; re-exported for the sync service.
export { TRACKED_KIND_BY_CATEGORY } from "./adapters/registry"

/** The kind an entry is tracked under: settings entries carry theirs, the rest have one per category. */
export const kindOf = (
  category: TemplateCategory,
  entry: Entry,
): TemplateResourceKind | undefined => {
  const fixed = TRACKED_KIND_BY_CATEGORY[category as TemplateResourceCategory]
  if (fixed) {
    return fixed
  }
  const parsed = templateResourceKinds.safeParse(entry.kind)
  return parsed.success ? parsed.data : undefined
}

export type SyncCounts = NonNullable<TemplateSyncOutcome["counts"]>

export type InstalledRow = Awaited<
  ReturnType<typeof templateInstallationSyncRepository.listInstalledResources>
>[number]

export type InstallCtx = ReturnType<typeof createInstallContext>["ctx"]

export type Adapter =
  (typeof templateAdapterRegistry)[keyof typeof templateAdapterRegistry]

/** A copy's projection before this sync wrote to it, by `kind:resourceId`. */
export type Projections = Map<
  string,
  Exclude<Awaited<ReturnType<ResourceSyncHandler["project"]>>, null>
>

export const projectionKey = (kind: string, resourceId: string): string =>
  `${kind}:${resourceId}`

export type ApplyInput = {
  sync: TemplateSyncRow
  /** The claim this apply runs under; salts the staged object keys. */
  claimToken: string
  installation: NonNullable<
    Awaited<
      ReturnType<typeof templateInstallationRepository.findByIdAndWorkspace>
    >
  >
  payload: TemplateExport
  version: number
  appliedHash: string
  fromVersion: number
  /** Categories this actor may not use are left alone. */
  installerActor: TemplateActor
  /** Storage objects staged for this apply; the caller deletes them if the attempt fails. */
  copiedObjectPaths: string[]
  /** The result of `stageSyncObjects`, run before the transaction opened. */
  staged?: StagedObjects
}

export type PublishedFlows = { flowId: string; versionId: string }[]
