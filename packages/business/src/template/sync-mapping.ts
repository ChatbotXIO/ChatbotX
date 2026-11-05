import type { DatabaseClient } from "@chatbotx.io/database/client"
import type { TemplateResourceCategory } from "@chatbotx.io/database/partials"
import {
  loadResourceLabels,
  templateInstallationSyncRepository,
} from "@chatbotx.io/database/repositories"
import type { TemplateExport } from "@chatbotx.io/flow-config"
import {
  isLabelledManifestKind,
  isManifestKind,
} from "./adapters/manifests/kinds"
import {
  INSTALL_ROOT_SOURCE_PREFIX,
  resolveManifests,
} from "./adapters/manifests/resolve"
import { getTemplateAdapter } from "./adapters/registry"
import { isUpdatable } from "./adapters/shared"
import { rootLevelFolderTypes } from "./install-root-placement"
import { canUseTemplateCategories } from "./permissions"
import { durableFieldNameBindings } from "./sync-field-bindings"
import {
  type ApplyInput,
  type InstallCtx,
  type InstalledRow,
  type Projections,
  projectionKey,
} from "./sync-types"

/**
 * Detaches mapped manifest rows whose target the installer deleted, so the
 * manifest is resolved again (find-or-create) instead of every synced
 * reference pointing at a row that no longer exists. Returns the rows that are
 * still live.
 */
export const dropDeletedManifestTargets = async (
  tx: DatabaseClient,
  workspaceId: string,
  rows: readonly InstalledRow[],
): Promise<InstalledRow[]> => {
  const manifestRows = rows.filter((row) => isManifestKind(row.resourceKind))
  if (manifestRows.length === 0) {
    return [...rows]
  }
  const labels = await loadResourceLabels(workspaceId, manifestRows, tx)
  const gone = manifestRows.filter(
    (row) =>
      isLabelledManifestKind(row.resourceKind) &&
      !labels.has(`${row.resourceKind}:${row.resourceId}`),
  )
  await templateInstallationSyncRepository.detachResources(
    gone.map((row) => row.id),
    tx,
  )
  const goneIds = new Set(gone.map((row) => row.id))
  return rows.filter((row) => !goneIds.has(row.id))
}

/**
 * Splits off copies the installer deleted: their rows are detached (the
 * provenance stays, and the template shipping them again will not bring them
 * back), and they never reach the id maps, so a reference from a new or
 * updated item cannot point at a row that no longer exists.
 */
export const dropDeletedCopies = async (
  tx: DatabaseClient,
  rows: readonly InstalledRow[],
): Promise<{
  live: InstalledRow[]
  gone: InstalledRow[]
  /** What each live updatable copy projected to, read once and reused by `syncPairs`. */
  projections: Projections
}> => {
  const gone: InstalledRow[] = []
  const projections: Projections = new Map()
  for (const row of rows) {
    if (isManifestKind(row.resourceKind)) {
      continue
    }
    const handler = getTemplateAdapter(
      row.category as TemplateResourceCategory,
    )?.sync
    if (!(handler && isUpdatable(handler))) {
      continue
    }
    const projection = await handler.project(tx, row.resourceId)
    if (projection === null) {
      gone.push(row)
    } else {
      projections.set(
        projectionKey(row.resourceKind, row.resourceId),
        projection,
      )
    }
  }
  await templateInstallationSyncRepository.detachResources(
    gone.map((row) => row.id),
    tx,
  )
  const goneIds = new Set(gone.map((row) => row.id))
  return { live: rows.filter((row) => !goneIds.has(row.id)), gone, projections }
}

export type Mapping = {
  /** Pre-update projections `dropDeletedCopies` already read: a copy is projected once before its update. */
  projections: Projections
  liveRows: InstalledRow[]
  /** Detached rows stay in the lookup: a copy the installer deleted (or the template dropped) must not come back. */
  rowByKey: Map<string, InstalledRow>
  deletedCopies: number
  /** The install tracked a root folder (live or since removed by the installer). */
  hadInstallRoots: boolean
}

/** Step 1: what earlier installs and syncs left behind, minus what the installer deleted since. */
export const loadMapping = async (
  tx: DatabaseClient,
  installation: ApplyInput["installation"],
): Promise<Mapping> => {
  const allRows =
    await templateInstallationSyncRepository.listInstalledResources(
      installation.id,
      tx,
    )
  const withLiveManifests = await dropDeletedManifestTargets(
    tx,
    installation.workspaceId,
    allRows.filter((row) => !row.detachedAt),
  )
  const {
    live: liveRows,
    gone,
    projections,
  } = await dropDeletedCopies(tx, withLiveManifests)
  const detachedAt = new Date()
  const rowByKey = new Map<string, InstalledRow>()
  for (const row of [
    ...allRows.filter((candidate) => candidate.detachedAt),
    ...gone.map((row) => ({ ...row, detachedAt })),
    ...liveRows,
  ]) {
    rowByKey.set(`${row.resourceKind}:${row.sourceResourceId}`, row)
  }
  const hadInstallRoots = allRows.some(
    (row) =>
      row.resourceKind === "folder" &&
      row.sourceResourceId.startsWith(INSTALL_ROOT_SOURCE_PREFIX),
  )
  return {
    liveRows,
    rowByKey,
    projections,
    deletedCopies: gone.length,
    hadInstallRoots,
  }
}

/** Step 2: the durable mapping first, so what earlier installs and syncs resolved stays. */
export const seedIdMaps = async (
  tx: DatabaseClient,
  ctx: InstallCtx,
  payload: TemplateExport,
  liveRows: readonly InstalledRow[],
): Promise<void> => {
  for (const row of liveRows) {
    const map = ctx.idMaps[row.resourceKind] ?? new Map<string, string>()
    map.set(row.sourceResourceId, row.resourceId)
    ctx.idMaps[row.resourceKind] = map
  }
  ctx.customFieldNameBindings = await durableFieldNameBindings(
    tx,
    payload.manifests.customFields,
    ctx.idMaps.customField ?? new Map(),
  )
}

/**
 * Step 3: manifests are find-or-create only, only for what is not mapped yet,
 * and only in categories the acting person may use (creating a tag or a
 * product category is as much a write as installing a flow). Returns whether
 * flows must keep their old graph.
 */
export const resolveSyncManifests = async (
  ctx: InstallCtx,
  input: Pick<ApplyInput, "payload" | "installerActor" | "installation"> & {
    usesInstallFolder: boolean
  },
): Promise<{ flowsBlockedByDeniedManifest: boolean }> => {
  const { installation } = input
  const { denied } = await resolveManifests(ctx, input.payload.manifests, {
    skipMapped: true,
    mayUse: (category) =>
      canUseTemplateCategories(input.installerActor, { [category]: 1 }),
    // The install made its roots when the template asked for an install
    // folder; the sync nests new folders under the same ones.
    installFolder: input.usesInstallFolder
      ? { templateName: installation.templateName, mode: "reuse" }
      : undefined,
    rootFolderTypes: input.usesInstallFolder
      ? rootLevelFolderTypes(input.payload.resources)
      : undefined,
  })
  // A flow that filters by a product category the actor may not create keeps
  // its old graph: without the category the reference would be cleared, and an
  // empty filter means every category (a live flow would start sending the
  // whole store).
  return { flowsBlockedByDeniedManifest: denied.has("productCategories") }
}
