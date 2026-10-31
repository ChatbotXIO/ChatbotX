import type { DatabaseClient } from "@chatbotx.io/database/client"
import type {
  TemplateCategory,
  TemplateResourceCategory,
  TemplateResourceKind,
  TemplateWarning,
} from "@chatbotx.io/database/partials"
import { templateResourceKinds } from "@chatbotx.io/database/partials"
import {
  loadResourceLabels,
  type TemplateSyncOutcome,
  type TemplateSyncRow,
  type templateInstallationRepository,
  templateInstallationSyncRepository,
  templateResourceBackupRepository,
} from "@chatbotx.io/database/repositories"
import type { TemplateExport } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import {
  isLabelledManifestKind,
  isManifestKind,
} from "./adapters/manifests/kinds"
import {
  INSTALL_ROOT_SOURCE_PREFIX,
  resolveManifests,
} from "./adapters/manifests/resolve"
import {
  getTemplateAdapter,
  TEMPLATE_INSTALL_ORDER,
  TRACKED_KIND_BY_CATEGORY,
  templateAdapterRegistry,
} from "./adapters/registry"
import { isUpdatable } from "./adapters/shared"
import type {
  PatchTask,
  ResourceSyncHandler,
  StagedObjects,
  SyncPair,
} from "./adapters/types"
import {
  rewriteBotFieldTokensDeep,
  rewriteCouponTokensDeep,
  rewriteFieldTokensDeep,
} from "./field-token-binder"
import {
  createInstallContext,
  entriesForCategory,
  flushTracked,
  lockFor,
  type TrackedResource,
} from "./install.service"
import {
  placeRootEntriesInInstallRoots,
  rootLevelFolderTypes,
} from "./install-root-placement"
import { hashCanonical } from "./payload-hash"
import { canUseTemplateCategories, type TemplateActor } from "./permissions"
import { durableFieldNameBindings } from "./sync-field-bindings"
import { stampSyncedHashes } from "./sync-hash"
import { COUPON_TOPICS_CATEGORY } from "./template-entries"
import { stageTemplateObjects } from "./template-staging"

/** A backup larger than this is not taken, and its resource is left as the installer has it. */
const MAX_BACKUP_BYTES = 1024 * 1024

type Entry = Record<string, unknown> & { sourceId: string }

// Derived from the adapter registry; re-exported for the sync service.
export { TRACKED_KIND_BY_CATEGORY } from "./adapters/registry"

/** The kind an entry is tracked under: settings entries carry theirs, the rest have one per category. */
const kindOf = (
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

type SyncCounts = NonNullable<TemplateSyncOutcome["counts"]>

const summarize = (warnings: TemplateWarning[]) => {
  const byCode = new Map<string, number>()
  for (const warning of warnings) {
    byCode.set(warning.entityKind, (byCode.get(warning.entityKind) ?? 0) + 1)
  }
  return [...byCode].map(([code, count]) => ({ code, count }))
}

export type PublishedFlows = { flowId: string; versionId: string }[]

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

type InstalledRow = Awaited<
  ReturnType<typeof templateInstallationSyncRepository.listInstalledResources>
>[number]

type InstallCtx = ReturnType<typeof createInstallContext>["ctx"]
type Adapter =
  (typeof templateAdapterRegistry)[keyof typeof templateAdapterRegistry]

/**
 * Detaches mapped manifest rows whose target the installer deleted, so the
 * manifest is resolved again (find-or-create) instead of every synced
 * reference pointing at a row that no longer exists. Returns the rows that are
 * still live.
 */
const dropDeletedManifestTargets = async (
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
const dropDeletedCopies = async (
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

/** A copy's projection before this sync wrote to it, by `kind:resourceId`. */
type Projections = Map<
  string,
  Exclude<Awaited<ReturnType<ResourceSyncHandler["project"]>>, null>
>

const projectionKey = (kind: string, resourceId: string): string =>
  `${kind}:${resourceId}`

type Mapping = {
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
const loadMapping = async (
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
const seedIdMaps = async (
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
const resolveSyncManifests = async (
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

type Plan = {
  category: TemplateCategory
  adapter: Adapter
  pairs: SyncPair[]
  fresh: Entry[]
}

type SyncState = {
  counts: SyncCounts
  shippedKeys: Set<string>
  /** Rows left untouched this sync; they must not get a fresh baseline. */
  skippedRowIds: Set<string>
}

/** Step 4: per category, what is new, what is already installed, and what this actor may not touch. */
const planCategories = (
  ctx: InstallCtx,
  input: {
    resources: TemplateExport["resources"]
    installerActor: TemplateActor
    flowsBlockedByDeniedManifest: boolean
    rowByKey: ReadonlyMap<string, InstalledRow>
    state: SyncState
  },
): Plan[] => {
  const { state, rowByKey } = input
  const plans: Plan[] = []
  for (const category of TEMPLATE_INSTALL_ORDER) {
    const adapter =
      templateAdapterRegistry[category as keyof typeof templateAdapterRegistry]
    if (!adapter) {
      continue
    }
    const entries = entriesForCategory(input.resources, category)
    if (entries.length === 0) {
      continue
    }
    const denied =
      !canUseTemplateCategories(input.installerActor, { [category]: 1 }) ||
      (category === "flows" && input.flowsBlockedByDeniedManifest)
    const pairs: SyncPair[] = []
    const fresh: Entry[] = []
    for (const entry of entries) {
      const kind = kindOf(category, entry)
      const key = kind ? `${kind}:${entry.sourceId}` : undefined
      const row = key ? rowByKey.get(key) : undefined
      if (key) {
        state.shippedKeys.add(key)
      }
      if (denied) {
        // Not something this installer could have installed: leave it alone,
        // and keep it governed (not detached) and unstamped.
        if (row) {
          state.skippedRowIds.add(row.id)
        }
      } else if (!row) {
        fresh.push(entry)
      } else if (!(row.detachedAt || isManifestKind(row.resourceKind))) {
        // A manifest kind (a bot field) is found-or-created only: its row
        // exists, so there is nothing to insert and nothing to update.
        pairs.push({ entry, resourceId: row.resourceId })
      }
    }
    if (denied) {
      state.counts.notUpdatable += entries.length
      ctx.warn({
        category,
        entityKind: "categoryPermissionDenied",
        path: category,
        value: String(entries.length),
      })
      continue
    }
    plans.push({ category, adapter, pairs, fresh })
  }
  return plans
}

/**
 * `{{coupon:<id>}}` and `{{bot_field:<id>}}` follow the copy they name, the
 * same two rewrites an install applies. Read at use time: the coupon topics
 * and the Account Fields a version adds are inserted before the categories
 * that carry the tokens.
 */
const rewriteSourceIdTokens = <T>(value: T, ctx: InstallCtx): T =>
  rewriteBotFieldTokensDeep(
    rewriteCouponTokensDeep(value, ctx.idMaps.couponTopic),
    ctx.idMaps.botField,
  )

/**
 * Copies the adapters actually created since the last flush. An entry an
 * adapter skips (a required reference it could not resolve) creates nothing
 * and is reported by its warning, so it is not counted as added.
 */
const createdSinceFlush = (tracked: readonly TrackedResource[]): number =>
  tracked.filter(
    (entry) => !(entry.wasExisting || isManifestKind(entry.resourceKind)),
  ).length

/**
 * Step 5: new items go in first, so an updated copy can point at one that this
 * version adds. Returns the adapters' deferred patches, run at the very end.
 */
const insertFresh = async (
  ctx: InstallCtx,
  plans: readonly Plan[],
  state: SyncState,
  tracked: readonly TrackedResource[],
  flush: () => Promise<void>,
): Promise<PatchTask[]> => {
  // `{{coupon:<id>}}` follows the installed topic, which may be one this
  // version adds, so the tokens are rewritten when an entry is used, after the
  // coupon topics (the first category) have been inserted.
  const patchTasks: PatchTask[] = []
  // Coupon topics a version adds go in before the early entries: a bot
  // field's value can carry `{{coupon:<id>}}`, which needs the installed id.
  for (const plan of plans) {
    if (plan.category !== COUPON_TOPICS_CATEGORY || plan.fresh.length === 0) {
      continue
    }
    patchTasks.push(
      ...(await plan.adapter.insert(
        ctx,
        rewriteSourceIdTokens(plan.fresh, ctx),
      )),
    )
    state.counts.created += createdSinceFlush(tracked)
    plan.fresh = []
    await flush()
  }
  // Early entries (a bot field a version adds) resolve before every category,
  // so `{{bot_field:<id>}}` text in a fresh questionnaire, product or saved
  // reply follows them (settings is written after those categories).
  for (const plan of plans) {
    const { earlyEntry, insertEarly } = plan.adapter
    if (!(earlyEntry && insertEarly)) {
      continue
    }
    const early = plan.fresh.filter(earlyEntry)
    if (early.length === 0) {
      continue
    }
    await insertEarly(
      ctx,
      rewriteCouponTokensDeep(early, ctx.idMaps.couponTopic),
    )
    state.counts.created += createdSinceFlush(tracked)
    plan.fresh = plan.fresh.filter((entry) => !earlyEntry(entry))
    await flush()
  }
  for (const plan of plans) {
    if (plan.fresh.length === 0) {
      continue
    }
    patchTasks.push(
      ...(await plan.adapter.insert(
        ctx,
        rewriteSourceIdTokens(plan.fresh, ctx),
      )),
    )
    state.counts.created += createdSinceFlush(tracked)
    await flush()
  }
  return patchTasks
}

/** Rule 6: a copy the template no longer ships stops being governed by it. */
const detachDropped = async (
  tx: DatabaseClient,
  liveRows: readonly InstalledRow[],
  state: SyncState,
): Promise<void> => {
  const dropped = liveRows.filter(
    (row) =>
      !(
        row.wasExisting ||
        isManifestKind(row.resourceKind) ||
        state.shippedKeys.has(`${row.resourceKind}:${row.sourceResourceId}`)
      ),
  )
  await templateInstallationSyncRepository.detachResources(
    dropped.map((row) => row.id),
    tx,
  )
  state.counts.detached += dropped.length
}

/**
 * The staging pre-phase of a sync, to run BEFORE the sync transaction opens.
 * Only what this sync is about to insert is staged: an entry that already has a
 * row (live or detached) is never copied again, so the cleanup after a failed
 * attempt can never delete an object an earlier install or sync still
 * references. The mapping is read without a lock, so two syncs of one
 * installation may stage at once: their keys are salted with the sync id, so a
 * loser's cleanup cannot delete the winner's committed objects.
 */
/** Identifies one claim of a sync: a redelivery after a lease takeover gets its own staged keys. */
export const syncAttemptKey = (syncId: string, claimToken: string): string =>
  `${syncId}:${claimToken}`

export const stageSyncObjects = async (input: {
  installation: ApplyInput["installation"]
  /**
   * Keys the staged objects per claim of one sync (sync id + claim token), so
   * the cleanup of an attempt that lost its lease can never delete the objects
   * of the attempt that took over: an ownership check before a delete is not
   * atomic with the delete, distinct keys are.
   */
  attemptKey: string
  payload: TemplateExport
  installerActor: TemplateActor
  copiedObjectPaths: string[]
}): Promise<StagedObjects> => {
  const { installation, payload } = input
  const rows = await templateInstallationSyncRepository.listInstalledResources(
    installation.id,
  )
  const known = new Set(
    rows.map((row) => `${row.resourceKind}:${row.sourceResourceId}`),
  )
  return await stageTemplateObjects({
    ctx: {
      workspaceId: installation.workspaceId,
      installationId: installation.id,
      scope: {
        generation: installation.stagingGeneration,
        attemptKey: input.attemptKey,
      },
      sourceWorkspaceId: payload.source.workspaceId,
      trackCopiedObject: (path) => {
        input.copiedObjectPaths.push(path)
      },
    },
    resources: payload.resources,
    include: (category, entry) => {
      if (!canUseTemplateCategories(input.installerActor, { [category]: 1 })) {
        return false
      }
      const kind = kindOf(category, entry)
      return !(kind && known.has(`${kind}:${entry.sourceId}`))
    },
  })
}

/**
 * Applies one template version to an installed copy, in the caller's
 * transaction: map what exists, resolve manifests, plan per category, insert
 * what is new, sync what is installed, detach what was dropped.
 */
export const applyVersion = async (
  tx: DatabaseClient,
  input: ApplyInput,
): Promise<{
  outcome: TemplateSyncOutcome
  publishedFlows: PublishedFlows
}> => {
  const { installation, payload, version } = input
  const { liveRows, rowByKey, projections, deletedCopies, hadInstallRoots } =
    await loadMapping(tx, installation)
  // Storage copies belong before the transaction; a caller that did not stage
  // gets them here, still correct but holding the connection during the I/O.
  const staged =
    input.staged ??
    (await stageSyncObjects({
      installation,
      attemptKey: syncAttemptKey(input.sync.id, input.claimToken),
      payload,
      installerActor: input.installerActor,
      copiedObjectPaths: input.copiedObjectPaths,
    }))
  const { ctx, warnings, tracked } = createInstallContext({
    tx,
    installationId: installation.id,
    workspaceId: installation.workspaceId,
    inboxBindings: installation.inboxBindings ?? undefined,
    sourceWorkspaceId: payload.source.workspaceId,
    staged,
  })
  const publishedFlows: PublishedFlows = []
  ctx.publishedFlows = publishedFlows
  const flush = async () =>
    await flushTracked(
      tx,
      installation.id,
      installation.workspaceId,
      tracked,
      (entry) =>
        lockFor(entry, { payload, permissions: installation.permissions }),
    )

  await seedIdMaps(tx, ctx, payload, liveRows)
  // The install nested its copies under roots it tracks; the installer may
  // since have deleted the first one (which clears `installFolderId`).
  const usesInstallFolder =
    Boolean(installation.installFolderId) || hadInstallRoots
  const { flowsBlockedByDeniedManifest } = await resolveSyncManifests(ctx, {
    ...input,
    usesInstallFolder,
  })
  await flush()

  const state: SyncState = {
    counts: {
      created: 0,
      updated: 0,
      detached: deletedCopies,
      overwrittenModified: 0,
      notUpdatable: 0,
    },
    shippedKeys: new Set(),
    skippedRowIds: new Set(),
  }
  // A copy a later version adds at the root is nested like the install's.
  const resources = rewriteFieldTokensDeep(
    usesInstallFolder
      ? placeRootEntriesInInstallRoots(payload.resources)
      : payload.resources,
    ctx.customFieldNameBindings ?? new Map(),
  )
  const plans = planCategories(ctx, {
    resources,
    installerActor: input.installerActor,
    flowsBlockedByDeniedManifest,
    rowByKey,
    state,
  })
  const patchTasks = await insertFresh(ctx, plans, state, tracked, flush)
  for (const plan of plans) {
    if (plan.pairs.length > 0) {
      await syncPairs(tx, {
        ctx,
        adapter: plan.adapter,
        pairs: rewriteSourceIdTokens(plan.pairs, ctx),
        rowByKey,
        projections,
        category: plan.category,
        sync: input.sync,
        installation,
        version,
        counts: state.counts,
        skippedRowIds: state.skippedRowIds,
        warn: (warning) => ctx.warn(warning),
      })
    }
  }
  // The adapters' own deferred patches.
  for (const task of patchTasks) {
    await task.apply(ctx)
  }
  await flush()

  await detachDropped(tx, liveRows, state)
  await stampSyncedHashes(tx, installation.id, version, state.skippedRowIds)

  const hasIssues = warnings.length > 0 || state.counts.notUpdatable > 0
  return {
    outcome: {
      status: hasIssues ? "partial" : "completed",
      fromVersion: input.fromVersion,
      appliedVersion: version,
      appliedHash: input.appliedHash,
      counts: state.counts,
      warnings,
      warningSummary: summarize(warnings),
    },
    publishedFlows,
  }
}

type SyncPairsInput = {
  ctx: InstallCtx
  adapter: Adapter
  pairs: SyncPair[]
  rowByKey: ReadonlyMap<string, InstalledRow>
  projections: Projections
  category: TemplateCategory
  sync: TemplateSyncRow
  installation: ApplyInput["installation"]
  version: number
  counts: SyncCounts
  /** Rows left untouched this sync; they must not get a fresh baseline. */
  skippedRowIds: Set<string>
  warn: (warning: TemplateWarning) => void
}

/**
 * What a modified copy needs before it can be overwritten: its backup. `null`
 * means the copy is left as the installer has it (and a warning says why).
 */
const backUpModifiedCopy = async (
  tx: DatabaseClient,
  input: SyncPairsInput,
  handler: NonNullable<Adapter["sync"]>,
  pair: SyncPair,
  row: InstalledRow,
): Promise<"overwrite" | "skip"> => {
  const path = `${input.category}.${pair.entry.sourceId}`
  const backup = await handler.serializeBackup(tx, pair.resourceId)
  if (!backup) {
    // Overwriting without a way back would lose the installer's edits.
    input.warn({
      category: input.category,
      entityKind: "backupUnavailable",
      path,
      value: row.id,
    })
    return "skip"
  }
  const byteSize = new TextEncoder().encode(
    JSON.stringify(backup.content),
  ).byteLength
  if (byteSize > MAX_BACKUP_BYTES) {
    input.warn({
      category: input.category,
      entityKind: "backupTooLarge",
      path,
      value: String(byteSize),
    })
    return "skip"
  }
  const backupId = createId()
  await templateResourceBackupRepository.insert(
    {
      id: backupId,
      workspaceId: input.installation.workspaceId,
      installationId: input.installation.id,
      syncId: input.sync.id,
      installedResourceId: row.id,
      resourceKind: row.resourceKind,
      resourceId: pair.resourceId,
      formatVersion: backup.formatVersion,
      content: backup.content,
      byteSize,
    },
    tx,
  )
  await templateResourceBackupRepository.pruneForResource(row.id, tx)
  input.warn({
    category: input.category,
    entityKind: "localModifiedOverwritten",
    path,
    // The id `restoreBackup` takes, so the warning leads straight to the undo.
    value: backupId,
  })
  input.counts.overwrittenModified++
  return "overwrite"
}

/** Rules 1-4 and 8: overwrite locked or untouched copies, back up and overwrite edited ones, detach deleted ones. */
const syncPairs = async (tx: DatabaseClient, input: SyncPairsInput) => {
  const handler = input.adapter.sync
  if (!isUpdatable(handler)) {
    // The handler raises the `notUpdatable` warning itself.
    input.counts.notUpdatable += input.pairs.length
    await handler.update(input.ctx, input.pairs)
    return
  }
  const rowFor = (pair: SyncPair) => {
    const kind = kindOf(input.category, pair.entry)
    return kind
      ? input.rowByKey.get(`${kind}:${pair.entry.sourceId}`)
      : undefined
  }
  const toUpdate: SyncPair[] = []
  for (const pair of input.pairs) {
    const row = rowFor(pair)
    if (!row) {
      continue
    }
    const memoKey = projectionKey(row.resourceKind, pair.resourceId)
    // Read once by `dropDeletedCopies`; only a copy it did not see (a fresh
    // one) is projected here.
    const current =
      input.projections.get(memoKey) ??
      (await handler.project(tx, pair.resourceId))
    input.projections.delete(memoKey)
    if (current === null) {
      // Deleted by the installer meanwhile: never recreated, no longer governed.
      await templateInstallationSyncRepository.detachResources([row.id], tx)
      input.counts.detached++
      continue
    }
    const modified =
      row.allowEdit &&
      (row.syncedHash === null ||
        (await hashCanonical(current)) !== row.syncedHash)
    if (
      modified &&
      (await backUpModifiedCopy(tx, input, handler, pair, row)) === "skip"
    ) {
      input.skippedRowIds.add(row.id)
      continue
    }
    toUpdate.push(pair)
  }
  if (toUpdate.length === 0) {
    return
  }
  await handler.update(input.ctx, toUpdate)
  input.counts.updated += toUpdate.length
  for (const pair of toUpdate) {
    const row = rowFor(pair)
    if (!row) {
      continue
    }
    const written = await handler.project(tx, pair.resourceId)
    await templateInstallationSyncRepository.markSynced(
      {
        id: row.id,
        syncedHash: written === null ? null : await hashCanonical(written),
        syncedVersion: input.version,
      },
      tx,
    )
  }
}
