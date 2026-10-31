import { type DatabaseClient, db, eq } from "@chatbotx.io/database/client"
import {
  isActiveInstallation,
  type TemplateActorKind,
  type TemplateSyncStatus,
  type TemplateSyncTrigger,
} from "@chatbotx.io/database/partials"
import {
  loadResourceLabels,
  templateInstallationRepository,
  templateInstallationSyncRepository,
  templateResourceBackupRepository,
  templateUninstallStateRepository,
  templateVersionRepository,
} from "@chatbotx.io/database/repositories"
import {
  type TemplateSyncCounts,
  templateInstallationModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import { ChatbotXException, notFoundException } from "../errors"
import {
  assertCanUseTemplateCategories,
  assertCanWriteTemplateInstalls,
  type TemplateActor,
} from "./permissions"
import { templateUninstallInProgressException } from "./template-errors"
import {
  SYNC_LEASE_MS,
  SYNC_REDISPATCH_MAX_AGE_MS,
  SYNC_UNCLAIMED_GRACE_MS,
} from "./template-leases"
import { templateUninstallCancelService } from "./uninstall-cancel.service"

export type TemplateSyncHistoryItem = {
  id: string
  status: TemplateSyncStatus
  trigger: TemplateSyncTrigger
  requestedVersion: number
  fromVersion: number | null
  appliedVersion: number | null
  errorCode: string | null
  counts: TemplateSyncCounts | null
  createdAt: Date
  finishedAt: Date | null
  /** Edited copies this sync overwrote, with a name to show and the backup to restore. */
  backups: { id: string; resourceKind: string; label: string | null }[]
}

/** Syncs shown with their backups on the installation page. */
const SYNC_HISTORY_PAGE = 10

/** Installations handled per fan-out batch. */
export const TEMPLATE_FAN_OUT_BATCH_SIZE = 500
const SYNC_HISTORY_LIMIT = 50

const templateInstallationNotSyncableException = () =>
  new ChatbotXException(
    "This template installation can not be synced",
    "templateInstallationNotSyncable",
    409,
  )

/**
 * Changing how an installed copy behaves (auto-update, who may uninstall it)
 * needs the permission of everything the installation holds, as installing it
 * did: it decides what runs with, or is removed from, those categories.
 */
const assertCanManageInstallation = async (
  installationId: string,
  actor: TemplateActor,
): Promise<void> => {
  const rows =
    await templateInstallationSyncRepository.listInstalledResources(
      installationId,
    )
  assertCanUseTemplateCategories(
    actor,
    Object.fromEntries(rows.map((row) => [row.category, 1])),
  )
}

/**
 * A choice that covers every copy the installer holds of a template (who may
 * uninstall it) needs the permission of everything any of those copies holds,
 * not only the one the request came through.
 */
export const assertCanManagePair = async (
  pair: { workspaceId: string; sourceTemplateId: string },
  actor: TemplateActor,
  tx?: DatabaseClient,
  options: { rejectInFlightInstall?: boolean } = {},
): Promise<void> => {
  // A copy still installing has no tracked resources yet, so its categories
  // cannot be known: the choice has to wait for it.
  if (
    options.rejectInFlightInstall &&
    (await templateInstallationRepository.findActiveBySourceTemplate(pair, tx))
  ) {
    throw new ChatbotXException(
      "An install of this template is in progress",
      "templateInstallationInProgress",
      409,
    )
  }
  const categories =
    await templateInstallationSyncRepository.listInstalledCategoriesByPair(
      pair,
      tx,
    )
  assertCanUseTemplateCategories(
    actor,
    Object.fromEntries(categories.map((category) => [category, 1])),
  )
}

export type RequestSyncInput = {
  workspaceId: string
  installationId: string
  actor: TemplateActor
  trigger: "manual" | "reinstall"
  /** The member asking (null for an API token); the sync runs with their permissions. */
  requestedBy?: string | null
  /** `member` when a member asked (even if the user is later deleted); default derives from `requestedBy`. */
  requestedByKind?: TemplateActorKind
  /** A reinstall re-enrols the copy: the installer's choice, else the template's default. */
  autoUpdate?: boolean
  /** A reinstall restates the installer's consent for the publisher to see and uninstall; absent keeps it. */
  acceptPublisherUninstall?: boolean
  /** A reinstall may bind inboxes again; null/absent keeps the current bindings. */
  inboxBindings?: Record<string, string> | null
  /**
   * The request's idempotency key (API header, or a client-generated key for
   * the action). A replay with the same key returns the sync it created.
   */
  idempotencyKey?: string
}

const templateIdempotencyKeyReusedException = () =>
  new ChatbotXException(
    "This idempotency key was already used for a different request",
    "idempotencyKeyReused",
    422,
  )

/**
 * What a keyed request asked for: its trigger and every input that changes
 * what it does. A replay must carry the same fingerprint; the same key with
 * other inputs (or for a manual sync instead of a reinstall) is a mistake the
 * caller must hear about, not a request to silently drop.
 */
const requestFingerprint = (input: RequestSyncInput): Promise<string> =>
  sha256Hex(
    JSON.stringify({
      trigger: input.trigger,
      autoUpdate: input.autoUpdate ?? null,
      acceptPublisherUninstall: input.acceptPublisherUninstall ?? null,
      inboxBindings: input.inboxBindings
        ? Object.keys(input.inboxBindings)
            .sort()
            .map((source) => [source, input.inboxBindings?.[source]])
        : null,
    }),
  )

/**
 * Edge-safe half of template sync: it only writes `TemplateInstallationSync`
 * rows (the outbox). Execution lives in the Node-only
 * `@chatbotx.io/business/template-sync/execute`.
 */
export const templateSyncRequestService = {
  /**
   * Queues a sync of one installed copy to the template's newest version.
   * Returns the sync already in flight instead of queuing a second one.
   */
  async request(
    input: RequestSyncInput,
  ): Promise<{ syncId: string; workspaceId: string; created: boolean }> {
    assertCanWriteTemplateInstalls(input.actor)
    const installation =
      await templateInstallationRepository.findByIdAndWorkspace({
        id: input.installationId,
        workspaceId: input.workspaceId,
      })
    if (!installation) {
      throw notFoundException("Template installation not found")
    }
    if (
      !installation.templateId ||
      installation.sourceDeletedAt ||
      !isActiveInstallation(installation.status)
    ) {
      throw templateInstallationNotSyncableException()
    }
    const template = await db.query.templateModel.findFirst({
      where: {
        id: installation.templateId,
        deletedAt: { isNull: true as const },
      },
      columns: { categoryCounts: true, defaultAutoUpdate: true },
    })
    if (!template) {
      throw templateInstallationNotSyncableException()
    }
    // The installer must be allowed to use what the sync will write.
    assertCanUseTemplateCategories(input.actor, template.categoryCounts)

    const templateId = installation.templateId
    const fingerprint = input.idempotencyKey
      ? await requestFingerprint(input)
      : null
    return await db.transaction(async (tx) => {
      await templateInstallationRepository.lockInstallRequest(
        { workspaceId: input.workspaceId, sourceTemplateId: templateId },
        tx,
      )
      await templateVersionRepository.lockVersions(templateId, tx)
      // An uninstall owns the copies until it is final; checked under the pair lock.
      if (
        await templateUninstallStateRepository.isInProgress(installation.id, tx)
      ) {
        throw templateUninstallInProgressException()
      }
      // A replayed request returns the sync it created, whatever became of it
      // since, and changes nothing else. The same key carrying a different
      // request is rejected instead.
      if (input.idempotencyKey) {
        const replay =
          await templateInstallationSyncRepository.findByIdempotencyKey(
            { installationId: installation.id, key: input.idempotencyKey },
            tx,
          )
        if (replay) {
          if (
            replay.requestFingerprint !== null &&
            replay.requestFingerprint !== fingerprint
          ) {
            throw templateIdempotencyKeyReusedException()
          }
          return {
            syncId: replay.id,
            workspaceId: replay.workspaceId,
            created: false,
          }
        }
      }
      // The installer's choices on a reinstall hold even when a sync is already
      // queued (an auto-update a save just started): they are theirs, not the sync's.
      if (
        input.trigger === "reinstall" &&
        input.acceptPublisherUninstall !== undefined
      ) {
        await assertCanManagePair(
          { workspaceId: input.workspaceId, sourceTemplateId: templateId },
          input.actor,
          tx,
          { rejectInFlightInstall: true },
        )
        await templateInstallationRepository.setPublisherUninstallGrant(
          {
            workspaceId: input.workspaceId,
            sourceTemplateId: templateId,
            granted: input.acceptPublisherUninstall,
          },
          tx,
        )
        if (!input.acceptPublisherUninstall) {
          await templateUninstallCancelService.cancelPublisherUninstalls(tx, {
            workspaceId: input.workspaceId,
            sourceTemplateId: templateId,
          })
        }
      }
      if (input.trigger === "reinstall") {
        await tx
          .update(templateInstallationModel)
          .set({
            autoUpdate: input.autoUpdate ?? template.defaultAutoUpdate,
            ...(input.inboxBindings
              ? { inboxBindings: input.inboxBindings }
              : {}),
          })
          .where(eq(templateInstallationModel.id, installation.id))
      }
      const active =
        await templateInstallationSyncRepository.findActiveByInstallation(
          installation.id,
          tx,
        )
      // A reinstall is the installer's own request: an auto-update that is only
      // queued (and would be skipped once they turn it off) gives way to it.
      const supersededByReinstall =
        active?.status === "pending" &&
        active.trigger === "autoUpdate" &&
        input.trigger === "reinstall"
      if (supersededByReinstall && active) {
        await templateInstallationSyncRepository.closeUnclaimed(
          {
            id: active.id,
            status: "cancelled",
            errorCode: "templateSyncSuperseded",
          },
          tx,
        )
      } else if (active) {
        return {
          syncId: active.id,
          workspaceId: active.workspaceId,
          created: false,
        }
      }
      const latest = await templateVersionRepository.findLatest(templateId, tx)
      if (!latest) {
        throw templateInstallationNotSyncableException()
      }
      const row = await templateInstallationSyncRepository.createIfAbsent(
        {
          id: createId(),
          workspaceId: input.workspaceId,
          installationId: installation.id,
          trigger: input.trigger,
          requestedVersion: latest.version,
          requestedBy: input.requestedBy ?? null,
          requestedByKind:
            input.requestedByKind ??
            (input.requestedBy ? "member" : "apiToken"),
          idempotencyKey: input.idempotencyKey ?? null,
          requestFingerprint: fingerprint,
        },
        tx,
      )
      if (!row) {
        throw templateInstallationNotSyncableException()
      }
      return { syncId: row.id, workspaceId: row.workspaceId, created: true }
    })
  },

  /**
   * One batch of the auto-update fan-out after a template save: a sync row for
   * every following installation that is behind `version`. Insert-or-ignore,
   * so a repeated fan-out (the sweep) creates nothing twice. `nextAfterId` is
   * the keyset cursor, `null` when the batch was the last.
   */
  async fanOutAutoUpdate(input: {
    templateId: string
    version: number
    afterId?: string | null
  }): Promise<{
    syncs: { id: string; workspaceId: string }[]
    nextAfterId: string | null
  }> {
    return await db.transaction(async (tx) => {
      // The same lock pinning and pruning versions take: the version a sync is
      // pinned to cannot be pruned between this check and the insert.
      await templateVersionRepository.lockVersions(input.templateId, tx)
      const pinned = await templateVersionRepository.find(
        { templateId: input.templateId, version: input.version },
        tx,
      )
      if (!pinned) {
        return { syncs: [], nextAfterId: null }
      }
      const candidates =
        await templateInstallationSyncRepository.listAutoUpdateCandidates(
          {
            templateId: input.templateId,
            version: input.version,
            afterId: input.afterId ?? null,
            limit: TEMPLATE_FAN_OUT_BATCH_SIZE,
          },
          tx,
        )
      const inserted =
        await templateInstallationSyncRepository.createManyIfAbsent(
          candidates.map((candidate) => ({
            id: createId(),
            workspaceId: candidate.workspaceId,
            installationId: candidate.id,
            trigger: "autoUpdate" as const,
            requestedVersion: input.version,
            requestedByKind: candidate.installedByKind,
          })),
          tx,
        )
      return {
        syncs: inserted.map((row) => ({
          id: row.id,
          workspaceId: row.workspaceId,
        })),
        nextAfterId:
          candidates.length === TEMPLATE_FAN_OUT_BATCH_SIZE
            ? (candidates.at(-1)?.id ?? null)
            : null,
      }
    })
  },

  /** The installer's choice to let the publisher see this workspace and uninstall the template. */
  async setPublisherUninstallGrant(input: {
    workspaceId: string
    installationId: string
    actor: TemplateActor
    granted: boolean
  }): Promise<void> {
    assertCanWriteTemplateInstalls(input.actor)
    const installation =
      await templateInstallationRepository.findByIdAndWorkspace({
        id: input.installationId,
        workspaceId: input.workspaceId,
      })
    if (!installation) {
      throw notFoundException("Template installation not found")
    }
    if (!installation.sourceTemplateId) {
      return
    }
    const sourceTemplateId = installation.sourceTemplateId
    // Authorize and write under the pair lock, so a concurrent install or sync
    // cannot add a protected category between the check and the write.
    await db.transaction(async (tx) => {
      await templateInstallationRepository.lockInstallRequest(
        { workspaceId: input.workspaceId, sourceTemplateId },
        tx,
      )
      const pair = { workspaceId: input.workspaceId, sourceTemplateId }
      await assertCanManagePair(pair, input.actor, tx, {
        rejectInFlightInstall: true,
      })
      await templateInstallationRepository.setPublisherUninstallGrant(
        { ...pair, granted: input.granted },
        tx,
      )
      if (!input.granted) {
        // A publisher uninstall nobody started is cancelled, and its Phase A is undone.
        await templateUninstallCancelService.cancelPublisherUninstalls(tx, pair)
      }
    })
  },

  /** The installer's switch for following later saves of the template. */
  async setAutoUpdate(input: {
    workspaceId: string
    installationId: string
    actor: TemplateActor
    autoUpdate: boolean
  }): Promise<void> {
    assertCanWriteTemplateInstalls(input.actor)
    const installation =
      await templateInstallationRepository.findByIdAndWorkspace({
        id: input.installationId,
        workspaceId: input.workspaceId,
      })
    if (!installation) {
      throw notFoundException("Template installation not found")
    }
    // A copy still installing has no installed rows to authorize against, so
    // its auto-update can be changed only once it finished.
    if (!isActiveInstallation(installation.status)) {
      throw new ChatbotXException(
        "Wait for the installation to finish before changing auto-update",
        "templateInstallationNotReady",
        409,
      )
    }
    await assertCanManageInstallation(installation.id, input.actor)
    await db
      .update(templateInstallationModel)
      .set({ autoUpdate: input.autoUpdate })
      .where(eq(templateInstallationModel.id, installation.id))
  },

  /** Syncs nobody finished: never enqueued / job lost, or a worker that died holding the lease. */
  async listUnfinished(limit: number) {
    const now = Date.now()
    return await templateInstallationSyncRepository.listUnfinished({
      pendingBefore: new Date(now - SYNC_UNCLAIMED_GRACE_MS),
      leaseExpiredBefore: new Date(now - SYNC_LEASE_MS),
      createdAfter: new Date(now - SYNC_REDISPATCH_MAX_AGE_MS),
      limit,
    })
  },

  /** Closes syncs the sweep has stopped retrying, so none stays pending (and blocks an uninstall) forever. */
  async abandonStale(): Promise<number> {
    return await templateInstallationSyncRepository.failAbandoned({
      createdBefore: new Date(Date.now() - SYNC_REDISPATCH_MAX_AGE_MS),
      errorCode: "templateSyncAbandoned",
    })
  },

  /** Templates whose auto-update installations are still behind, for the catch-up fan-out. */
  async listTemplatesNeedingFanOut(limit: number) {
    return await templateInstallationSyncRepository.listTemplatesBehind(limit)
  },

  /**
   * Closes a sync that can never run (blocked owner, source gone) so the sweep
   * stops finding it, including one a dead worker left `running`.
   */
  async closeUnclaimed(input: {
    syncId: string
    status: "skipped" | "failed"
    errorCode: string
  }) {
    await templateInstallationSyncRepository.closeUnclaimed({
      id: input.syncId,
      status: input.status,
      errorCode: input.errorCode,
      leaseExpiredBefore: new Date(Date.now() - SYNC_LEASE_MS),
    })
  },

  /** The newest syncs of an installation with the backups each took, ready to render. */
  async listHistory(input: {
    workspaceId: string
    installationId: string
  }): Promise<TemplateSyncHistoryItem[]> {
    const syncs = (
      await templateInstallationSyncRepository.listByInstallation({
        ...input,
        limit: SYNC_HISTORY_PAGE,
      })
    ).filter((sync) => sync.workspaceId === input.workspaceId)
    const backupsBySync = new Map(
      await Promise.all(
        syncs.map(
          async (sync) =>
            [
              sync.id,
              sync.counts?.overwrittenModified
                ? await templateResourceBackupRepository.listBySync(sync.id)
                : [],
            ] as const,
        ),
      ),
    )
    const labels = await loadResourceLabels(
      input.workspaceId,
      [...backupsBySync.values()].flat(),
    )
    return syncs.map((sync) => ({
      id: sync.id,
      status: sync.status,
      trigger: sync.trigger,
      requestedVersion: sync.requestedVersion,
      fromVersion: sync.fromVersion,
      appliedVersion: sync.appliedVersion,
      errorCode: sync.errorCode,
      counts: sync.counts,
      createdAt: sync.createdAt,
      finishedAt: sync.finishedAt,
      backups: (backupsBySync.get(sync.id) ?? []).map((backup) => ({
        id: backup.id,
        resourceKind: backup.resourceKind,
        label:
          labels.get(`${backup.resourceKind}:${backup.resourceId}`) ?? null,
      })),
    }))
  },

  /** Sync history of one installation, newest first. */
  async list(input: { workspaceId: string; installationId: string }) {
    return await templateInstallationSyncRepository.listByInstallation({
      ...input,
      limit: SYNC_HISTORY_LIMIT,
    })
  },

  /** One sync with the backups it took. */
  async getDetail(input: {
    workspaceId: string
    installationId: string
    syncId: string
  }) {
    const sync = await templateInstallationSyncRepository.findById({
      id: input.syncId,
      workspaceId: input.workspaceId,
    })
    if (!sync || sync.installationId !== input.installationId) {
      throw notFoundException("Template sync not found")
    }
    const backups = await templateResourceBackupRepository.listBySync(sync.id)
    return { sync, backups }
  },
}
