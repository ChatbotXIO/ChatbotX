import { type DatabaseClient, db, sql } from "@chatbotx.io/database/client"
import type {
  TemplateCategory,
  TemplatePermissions,
  TemplateResourceKind,
} from "@chatbotx.io/database/partials"
import { templateInstallationRepository } from "@chatbotx.io/database/repositories"
import { templateInstalledResourceModel } from "@chatbotx.io/database/schema"
import { setLocalStatementTimeout } from "@chatbotx.io/database/statement-timeout"
import { updateTriggerCache } from "@chatbotx.io/events"
import type { TemplateExport } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { aiAgentService } from "../ai-agent/service"
import { automatedResponseService } from "../automated-response/service"
import { botFieldService } from "../bot-field/service"
import { couponService } from "../coupon/service"
import { customFieldService } from "../custom-field/service"
import { ChatbotXException, toPublicErrorMessage } from "../errors"
import { logger } from "../logger"
import { pipelineService } from "../pipeline/service"
import { resolveManifests } from "./adapters/manifests/resolve"
import { getTemplateAdapter, TEMPLATE_INSTALL_ORDER } from "./adapters/registry"
import type {
  PatchTask,
  StagedObjects,
  TemplateInstallContext,
  TemplateInstallWarning,
} from "./adapters/types"
import {
  rewriteBotFieldTokensDeep,
  rewriteCouponTokensDeep,
  rewriteFieldTokensDeep,
} from "./field-token-binder"
import {
  placeRootEntriesInInstallRoots,
  rootLevelFolderTypes,
} from "./install-root-placement"
import {
  flushPublishEffects,
  PUBLISH_EFFECTS_SWEEP_GRACE_MS,
} from "./publish-effects"
import { stampSyncedHashes } from "./sync-hash"
import { COUPON_TOPICS_CATEGORY, entriesForCategory } from "./template-entries"
import { INSTALL_LEASE_MS, STAGED_CLEANUP_LEASE_MS } from "./template-leases"
import { markTemplateEngineTransaction } from "./template-resource-locks"
import { deleteInstallStagedObjects } from "./template-staged-cleanup"
import { stageTemplateObjects } from "./template-staging"

const MAX_STORED_WARNINGS = 200

// The lease was committed before the apply transaction, and storage copies are
// staged before it opens (see `stageTemplateObjects`). The cap bounds a stuck
// statement.
const TEMPLATE_INSTALL_STATEMENT_TIMEOUT = "60s"
// Built when the install runs, not at import: this module sits behind the
// business barrel, which unrelated suites import with a partial client mock.
const idleTimeoutStatement = () =>
  sql.raw("SET LOCAL idle_in_transaction_session_timeout = '30s'")

export type TrackedResource = {
  category: TemplateCategory
  resourceKind: TemplateResourceKind
  resourceId: string
  sourceResourceId: string
  wasExisting: boolean
}

export { entriesForCategory } from "./template-entries"

/**
 * Builds the mutable `TemplateInstallContext` shared across all three
 * phases. `track`/`warn` are synchronous accumulators — no adapter awaits
 * them — so the actual `TemplateInstalledResource` batch insert happens
 * once, explicitly, after tracked rows accumulate (see `flushTracked`
 * below) rather than as an unawaited per-call side effect racing the
 * transaction commit.
 */
export type CreateInstallContextInput = {
  tx: DatabaseClient
  installationId: string
  workspaceId: string
  /** `{ sourceInboxId: targetInboxId }` the installer chose, if any. */
  inboxBindings?: Readonly<Record<string, string>>
  /** The workspace the template was published from. */
  sourceWorkspaceId: string
  /** Storage objects the staging pre-phase already copied. */
  staged?: StagedObjects
}

export const createInstallContext = (
  input: CreateInstallContextInput,
): {
  ctx: TemplateInstallContext
  tracked: TrackedResource[]
  warnings: TemplateInstallWarning[]
  resourceCount: { value: number }
} => {
  const tracked: TrackedResource[] = []
  const warnings: TemplateInstallWarning[] = []
  const resourceCount = { value: 0 }

  const ctx: TemplateInstallContext = {
    tx: input.tx,
    workspaceId: input.workspaceId,
    installationId: input.installationId,
    idMaps: {},
    inboxBindings: input.inboxBindings,
    sourceWorkspaceId: input.sourceWorkspaceId,
    staged: input.staged,
    track: (entry) => {
      tracked.push(entry)
      resourceCount.value++
    },
    warn: (warning) => {
      if (warnings.length < MAX_STORED_WARNINGS) {
        warnings.push(warning)
      }
    },
  }

  return { ctx, tracked, warnings, resourceCount }
}

/** What a copy may do once installed; a reused row is never locked. */
type ItemLock = { allowEdit: boolean; allowDelete: boolean }

/**
 * The lock a tracked copy installs with, copied once and never re-derived: the
 * template's install-wide `allowEdit` / `allowDelete`, narrowed by the item's
 * own View-only choice in the payload's `permissions` map.
 */
export const lockFor = (
  entry: TrackedResource,
  input: Pick<TemplateInstallRunInput, "payload" | "permissions">,
): ItemLock => {
  if (entry.wasExisting) {
    return { allowEdit: true, allowDelete: true }
  }
  const itemLocked =
    input.payload.permissions?.[entry.category]?.[entry.sourceResourceId]
      ?.allowEdit === false
  return {
    allowEdit: input.permissions.allowEdit && !itemLocked,
    allowDelete: input.permissions.allowDelete,
  }
}

export const flushTracked = async (
  tx: DatabaseClient,
  installationId: string,
  workspaceId: string,
  tracked: TrackedResource[],
  lockOf: (entry: TrackedResource) => ItemLock,
): Promise<void> => {
  if (tracked.length === 0) {
    return
  }
  await tx.insert(templateInstalledResourceModel).values(
    tracked.map((entry) => ({
      id: createId(),
      installationId,
      workspaceId,
      category: entry.category,
      resourceKind: entry.resourceKind,
      resourceId: entry.resourceId,
      sourceResourceId: entry.sourceResourceId,
      wasExisting: entry.wasExisting,
      ...lockOf(entry),
    })),
  )
  tracked.length = 0
}

type RunInstallResult = {
  status: "completed" | "partial"
  warnings: TemplateInstallWarning[]
  resourceCount: number
  installFolderId: string | null
  /** Flows installed with a published version, for the after-publish effects. */
  publishedFlows: { flowId: string; versionId: string }[]
}

/**
 * Phase R (manifests) -> Phase 1 (adapters, in `TEMPLATE_INSTALL_ORDER`) ->
 * Phase 2 (drain every returned `PatchTask`) — all inside one transaction,
 * with provenance rows written inside it. A partial install has no
 * compensating-delete story across 15+ tables, so anything short of a full
 * commit means the whole install rolls back; per-resource failures (a
 * webchat's quota exhaustion, an unresolved reference) degrade to a
 * `warnings` entry instead of throwing.
 */
const runInstall = async (
  tx: DatabaseClient,
  input: TemplateInstallRunInput,
  staged: StagedObjects,
): Promise<RunInstallResult> => {
  const lockOf = (entry: TrackedResource) => lockFor(entry, input)
  const { ctx, tracked, warnings, resourceCount } = createInstallContext({
    tx,
    installationId: input.installationId,
    workspaceId: input.workspaceId,
    inboxBindings: input.inboxBindings,
    sourceWorkspaceId: input.payload.source.workspaceId,
    staged,
  })
  const publishedFlows: RunInstallResult["publishedFlows"] = []
  ctx.publishedFlows = publishedFlows

  const { installFolderId } = await resolveManifests(
    ctx,
    input.payload.manifests,
    {
      skipMapped: false,
      mayUse: () => true,
      installFolder: input.createInstallFolder
        ? { templateName: input.templateName, mode: "create" }
        : undefined,
      rootFolderTypes: input.createInstallFolder
        ? rootLevelFolderTypes(input.payload.resources)
        : undefined,
    },
  )
  await flushTracked(
    tx,
    input.installationId,
    input.workspaceId,
    tracked,
    lockOf,
  )

  // A field reused under another spelling, or created under a renamed name, is
  // addressed by `{{name}}` in the shipped text, so the tokens follow it.
  const resources = rewriteFieldTokensDeep(
    input.createInstallFolder
      ? placeRootEntriesInInstallRoots(input.payload.resources)
      : input.payload.resources,
    ctx.customFieldNameBindings ?? new Map(),
  )

  const patchTasks: PatchTask[] = []
  const insertedCategories = new Set<TemplateCategory>()
  const insertCategory = async (category: TemplateCategory): Promise<void> => {
    const adapter = getTemplateAdapter(category)
    if (!adapter) {
      return
    }
    // Coupon topics install before every category that can name one, so the
    // `{{coupon:<id>}}` tokens in this category's text can follow them.
    // Likewise `{{bot_field:<id>}}` follows the Account Field it resolved to
    // (settings installs before every category that can carry the text).
    const entries = rewriteBotFieldTokensDeep(
      rewriteCouponTokensDeep(
        entriesForCategory(resources, category).filter(
          (entry) => !adapter.earlyEntry?.(entry),
        ),
        ctx.idMaps.couponTopic,
      ),
      ctx.idMaps.botField,
    )
    if (entries.length === 0) {
      return
    }
    patchTasks.push(...(await adapter.insert(ctx, entries)))
    await flushTracked(
      tx,
      input.installationId,
      input.workspaceId,
      tracked,
      lockOf,
    )
  }

  // Coupon topics go in before the early entries: a bot field's value can
  // carry `{{coupon:<id>}}`, which needs the installed topic's id.
  await insertCategory(COUPON_TOPICS_CATEGORY)
  insertedCategories.add(COUPON_TOPICS_CATEGORY)

  // Early entries (settings' bot fields) resolve before any category:
  // `{{bot_field:<id>}}` text in a questionnaire, product or saved reply must
  // follow the field it names, and those are written before or with settings.
  for (const category of TEMPLATE_INSTALL_ORDER) {
    const adapter = getTemplateAdapter(category)
    if (!(adapter?.earlyEntry && adapter.insertEarly)) {
      continue
    }
    const early = rewriteCouponTokensDeep(
      entriesForCategory(resources, category).filter(adapter.earlyEntry),
      ctx.idMaps.couponTopic,
    )
    if (early.length === 0) {
      continue
    }
    await adapter.insertEarly(ctx, early)
    await flushTracked(
      tx,
      input.installationId,
      input.workspaceId,
      tracked,
      lockOf,
    )
  }

  for (const category of TEMPLATE_INSTALL_ORDER) {
    if (!insertedCategories.has(category)) {
      await insertCategory(category)
    }
  }

  for (const task of patchTasks) {
    await task.apply(ctx)
  }
  await flushTracked(
    tx,
    input.installationId,
    input.workspaceId,
    tracked,
    lockOf,
  )

  return {
    status: warnings.length > 0 ? "partial" : "completed",
    warnings,
    resourceCount: resourceCount.value,
    installFolderId,
    publishedFlows,
  }
}

/**
 * Cache tags touched by an install, drained by the caller strictly after
 * the transaction commits — invalidating inside `tx` risks repopulating
 * Redis from an uncommitted read, exactly as `importFlowExport` documents.
 * Covers every category whose adapter can insert a resource with its own
 * cache layer: custom fields, keywords (automatedResponse), triggers, and AI
 * agents. An installed trigger or AI agent was previously served stale until
 * something else evicted it.
 */
export const invalidateAfterCommit = async (
  workspaceId: string,
): Promise<void> => {
  await Promise.all([
    customFieldService.invalidate({ workspaceId }),
    // Bot fields created by the settings adapter invalidate inside the tx
    // (botFieldService.create), which a concurrent reader can immediately
    // repopulate from a pre-commit snapshot — re-invalidate after commit so
    // the whole-workspace variable-map cache picks up the new fields.
    botFieldService.invalidate({ workspaceId }),
    automatedResponseService.invalidateCache(workspaceId),
    updateTriggerCache(workspaceId),
    aiAgentService.invalidate({ workspaceId }),
    pipelineService.invalidateList(workspaceId),
    couponService.invalidate(workspaceId),
  ])
}

/**
 * Raised inside the apply transaction when the lease was lost (another
 * worker reclaimed the row), so every write of this attempt rolls back.
 */
const TEMPLATE_INSTALL_LEASE_LOST_CODE = "templateInstallLeaseLost"

const templateInstallLeaseLostException = () =>
  new ChatbotXException(
    "The template install lease was lost",
    TEMPLATE_INSTALL_LEASE_LOST_CODE,
  )

/** A `pending` row younger than this may still be on its way to the queue. */
const TEMPLATE_INSTALL_UNCLAIMED_GRACE_MS = 5 * 60 * 1000
/** The sweep stops retrying an installation this old. */
const TEMPLATE_INSTALL_REDISPATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000

const unfinishedWindow = (now: number) => ({
  pendingBefore: new Date(now - TEMPLATE_INSTALL_UNCLAIMED_GRACE_MS),
  leaseExpiredBefore: new Date(now - INSTALL_LEASE_MS),
})

export type TemplateInstallRunInput = {
  installationId: string
  workspaceId: string
  claimToken: string
  /** The installation's copied permissions (`allowEdit` / `allowDelete`). */
  permissions: TemplatePermissions
  /** `{ sourceInboxId: targetInboxId }` the installer chose, if any. */
  inboxBindings?: Readonly<Record<string, string>>
  payload: TemplateExport
  templateName: string
  createInstallFolder: boolean
  /** The template version being applied; recorded on the copies as their baseline. */
  sourceVersion: number
  /**
   * `TemplateInstallation.stagingGeneration`: the storage keys this attempt
   * stages under. Absent means the first generation.
   */
  stagingGeneration?: number
}

/**
 * Deletes the staged objects of every generation an installation still owes,
 * oldest first, under the cleanup lease. A generation counts as cleaned only
 * when no key failed to delete, so a partial or throwing delete is retried by
 * the sweep; the lease is released either way. True when everything owed is gone.
 *
 * `stamp: false` deletes without recording it: right after a failure, a
 * stale attempt of the same generation (its lease lost, still copying) may
 * write a key after this delete, so only the sweep — past twice the install
 * lease, when nothing can still write — stamps the generation clean.
 */
const cleanStagedObjects = async (input: {
  installationId: string
  completedBefore: Date
  stamp: boolean
}): Promise<boolean> => {
  const claim = await templateInstallationRepository.claimStagedObjectsCleanup({
    id: input.installationId,
    completedBefore: input.completedBefore,
    leaseExpiredBefore: new Date(Date.now() - STAGED_CLEANUP_LEASE_MS),
  })
  if (!claim) {
    return false
  }
  let done = true
  try {
    for (let generation = claim.from; generation <= claim.to; generation += 1) {
      const result = await deleteInstallStagedObjects({
        workspaceId: claim.workspaceId,
        installationId: input.installationId,
        generation,
      })
      if (result.failed > 0) {
        done = false
        break
      }
      if (!input.stamp) {
        continue
      }
      await templateInstallationRepository.advanceStagedCleanedGeneration({
        id: input.installationId,
        from: generation,
        to: generation,
      })
    }
  } finally {
    await templateInstallationRepository.releaseStagedObjectsCleanup(
      input.installationId,
    )
  }
  return done
}

export const templateInstallService = {
  /**
   * Takes the install lease in one statement. `null` means the job is a
   * redelivery or another worker owns the row — the caller must do nothing.
   */
  async claim(input: {
    installationId: string
    workspaceId: string
  }): Promise<{ claimToken: string } | null> {
    const claimToken = createId()
    const claimed = await templateInstallationRepository.claim({
      id: input.installationId,
      workspaceId: input.workspaceId,
      claimToken,
      leaseExpiredBefore: new Date(Date.now() - INSTALL_LEASE_MS),
    })
    return claimed ? { claimToken } : null
  },

  /**
   * One bounded apply transaction: every write is fenced by the lease, and
   * it commits together with `completed`/`partial`. On any thrown error the
   * transaction rolls back entirely and the row is left `installing` — the
   * caller (the worker handler) classifies the error and either releases the
   * claim for a retry or records the terminal failure via `fail`.
   */
  async run(input: TemplateInstallRunInput): Promise<void> {
    {
      // Storage I/O happens here, before the transaction: inside it the copies
      // would hold a connection idle past `idle_in_transaction_session_timeout`.
      const staged = await stageTemplateObjects({
        ctx: {
          workspaceId: input.workspaceId,
          // Keys are deterministic per (installation, generation), so a
          // redelivery overwrites them. Nothing deletes them on a failed
          // attempt (a lease check before a delete is not atomic): a FINAL
          // failure deletes its generation by prefix, see `fail` and
          // `cleanupFailedObjects`, while a manual retry stages under the next
          // generation and never meets that delete.
          installationId: input.installationId,
          scope: { generation: input.stagingGeneration ?? 0 },
          sourceWorkspaceId: input.payload.source.workspaceId,
          trackCopiedObject: () => undefined,
        },
        resources: input.payload.resources,
      })
      await db.transaction(async (tx) => {
        markTemplateEngineTransaction(tx)
        await setLocalStatementTimeout(tx, TEMPLATE_INSTALL_STATEMENT_TIMEOUT)
        await tx.execute(idleTimeoutStatement())

        const outcome = await runInstall(tx, input, staged)
        await stampSyncedHashes(tx, input.installationId, input.sourceVersion)

        const completed = await templateInstallationRepository.complete(
          {
            id: input.installationId,
            claimToken: input.claimToken,
            completion: {
              status: outcome.status,
              warnings: outcome.warnings,
              warningCount: outcome.warnings.length,
              resourceCount: outcome.resourceCount,
              installFolderId: outcome.installFolderId,
              // Owed until run: a crash after commit cannot lose them.
              pendingPublishEffects:
                outcome.publishedFlows.length > 0
                  ? outcome.publishedFlows
                  : null,
            },
          },
          tx,
        )
        if (!completed) {
          throw templateInstallLeaseLostException()
        }
      })
    }

    await invalidateAfterCommit(input.workspaceId)
    // Same effects as a manual publish (version-list cache, Meta welcome-flow
    // sync, stale quick-reply state), which only make sense once the rows are
    // committed. Recorded on the installation by the completion above, so the
    // sweep re-runs them if this process dies here.
    await flushPublishEffects({
      installationId: input.installationId,
      workspaceId: input.workspaceId,
    })
  },

  /** Runs the after-publish effects an installation still owes (see `flushPublishEffects`). */
  flushPublishEffects,

  /** Installations that committed but never ran their after-publish effects. */
  listPendingPublishEffects(limit: number) {
    return templateInstallationRepository.listWithPendingPublishEffects({
      settledBefore: new Date(Date.now() - PUBLISH_EFFECTS_SWEEP_GRACE_MS),
      limit,
    })
  },

  /**
   * Installations nobody finished — never enqueued / job lost, or a worker
   * that died holding the lease — and still young enough to retry.
   */
  listStale(limit: number) {
    const now = Date.now()
    return templateInstallationRepository.listStale({
      ...unfinishedWindow(now),
      createdAfter: new Date(now - TEMPLATE_INSTALL_REDISPATCH_MAX_AGE_MS),
      limit,
    })
  },

  /** Closes what the sweep has stopped retrying, so nothing stays pending forever. */
  abandonStale(): Promise<number> {
    const now = Date.now()
    return templateInstallationRepository.failAbandoned({
      ...unfinishedWindow(now),
      createdBefore: new Date(now - TEMPLATE_INSTALL_REDISPATCH_MAX_AGE_MS),
      errorCode: "templateInstallAbandoned",
      errorMessage: "The template install could not be completed",
    })
  },

  /** Gives the claim back so BullMQ's retry (or the sweep) can run the install again. */
  async release(input: {
    installationId: string
    claimToken: string
  }): Promise<void> {
    await templateInstallationRepository.release({
      id: input.installationId,
      claimToken: input.claimToken,
    })
  },

  /** Records the terminal failure, fenced by the lease, in its own transaction. */
  async fail(input: {
    installationId: string
    workspaceId: string
    claimToken: string
    errorCode: string
    error: unknown
  }): Promise<void> {
    const failed = await templateInstallationRepository.fail({
      id: input.installationId,
      claimToken: input.claimToken,
      errorCode: input.errorCode,
      errorMessage: toPublicErrorMessage(
        input.error,
        "Template install failed",
      ),
    })
    if (!failed) {
      // Fenced out: another attempt owns the row and may reference the keys.
      return
    }
    // Terminal and unclaimed now: free the storage at once, but leave the
    // generation owed — the sweep deletes it again past the lease window and
    // only then stamps it, catching a late write by a stale attempt.
    try {
      await cleanStagedObjects({
        installationId: input.installationId,
        completedBefore: new Date(Date.now() + 1000),
        stamp: false,
      })
    } catch (err) {
      logger.warn(
        { err, installationId: input.installationId },
        "Template: could not clean a failed install's staged objects",
      )
    }
  },

  /**
   * The sweep's half of the cleanup: staged-object generations whose delete
   * never finished — a failed install past its lease window, or the earlier
   * generations of a retried one. Each row is leased before deleting, so one
   * worker does it, and is stamped clean only after every key is gone.
   */
  async cleanupFailedObjects(limit: number): Promise<number> {
    const now = Date.now()
    const completedBefore = new Date(now - 2 * INSTALL_LEASE_MS)
    const rows =
      await templateInstallationRepository.listWithStagedObjectsToClean({
        completedBefore,
        leaseExpiredBefore: new Date(now - STAGED_CLEANUP_LEASE_MS),
        limit,
      })
    let cleaned = 0
    for (const row of rows) {
      try {
        if (
          await cleanStagedObjects({
            installationId: row.id,
            completedBefore,
            stamp: true,
          })
        ) {
          cleaned += 1
        }
      } catch (err) {
        logger.warn(
          { err, installationId: row.id },
          "Template: could not clean a failed install's staged objects",
        )
      }
    }
    return cleaned
  },
}
