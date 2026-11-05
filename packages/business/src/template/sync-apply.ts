import type { DatabaseClient } from "@chatbotx.io/database/client"
import type {
  TemplateCategory,
  TemplateWarning,
} from "@chatbotx.io/database/partials"
import {
  type TemplateSyncOutcome,
  templateInstallationSyncRepository,
} from "@chatbotx.io/database/repositories"
import type { TemplateExport } from "@chatbotx.io/flow-config"
import { isManifestKind } from "./adapters/manifests/kinds"
import {
  TEMPLATE_INSTALL_ORDER,
  templateAdapterRegistry,
} from "./adapters/registry"
import type { PatchTask, StagedObjects, SyncPair } from "./adapters/types"
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
import { placeRootEntriesInInstallRoots } from "./install-root-placement"
import { canUseTemplateCategories, type TemplateActor } from "./permissions"
import { stampSyncedHashes } from "./sync-hash"
import { loadMapping, resolveSyncManifests, seedIdMaps } from "./sync-mapping"
import { syncPairs } from "./sync-pairs"

import {
  type Adapter,
  type ApplyInput,
  type Entry,
  type InstallCtx,
  type InstalledRow,
  kindOf,
  type PublishedFlows,
  type SyncCounts,
} from "./sync-types"
import { COUPON_TOPICS_CATEGORY } from "./template-entries"
import { stageTemplateObjects } from "./template-staging"

// Derived from the adapter registry; re-exported for the sync service.
export { TRACKED_KIND_BY_CATEGORY } from "./adapters/registry"
export type { ApplyInput, PublishedFlows } from "./sync-types"

const summarize = (warnings: TemplateWarning[]) => {
  const byCode = new Map<string, number>()
  for (const warning of warnings) {
    byCode.set(warning.entityKind, (byCode.get(warning.entityKind) ?? 0) + 1)
  }
  return [...byCode].map(([code, count]) => ({ code, count }))
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
