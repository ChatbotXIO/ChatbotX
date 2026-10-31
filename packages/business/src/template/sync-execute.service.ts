import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import { isActiveInstallation } from "@chatbotx.io/database/partials"
import {
  type TemplateSyncRow,
  templateInstallationRepository,
  templateInstallationSyncRepository,
  templateUninstallStateRepository,
  templateVersionRepository,
} from "@chatbotx.io/database/repositories"
import { setLocalStatementTimeout } from "@chatbotx.io/database/statement-timeout"
import { parseTemplateExport } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { ChatbotXException } from "../errors"
import { logger } from "../logger"
import { getTemplateAdapter } from "./adapters/registry"
import { isUpdatable } from "./adapters/shared"
import type { StagedObjects } from "./adapters/types"
import { invalidateAfterCommit } from "./install.service"
import { flushPublishEffects } from "./publish-effects"
import { templateService } from "./service"
import {
  applyVersion,
  type PublishedFlows,
  stageSyncObjects,
  syncAttemptKey,
} from "./sync-apply"
import { deleteCopiedObjects } from "./template-copied-objects"
import { templateSourceMissingException } from "./template-errors"
import { SYNC_LEASE_MS } from "./template-leases"
import {
  acquireTemplateResourceLocks,
  markTemplateEngineTransaction,
} from "./template-resource-locks"

export { TRACKED_KIND_BY_CATEGORY } from "./sync-apply"

const TEMPLATE_SYNC_STATEMENT_TIMEOUT = "60s"

const leaseLostException = () =>
  new ChatbotXException(
    "The template sync lease was lost",
    "templateSyncLeaseLost",
  )

export const templateSyncExecuteService = {
  /** Takes the sync lease; `null` means a redelivery or another worker owns it. */
  async claim(input: { syncId: string; workspaceId: string }) {
    const claimToken = createId()
    const claimed = await templateInstallationSyncRepository.claim({
      id: input.syncId,
      workspaceId: input.workspaceId,
      claimToken,
      leaseExpiredBefore: new Date(Date.now() - SYNC_LEASE_MS),
    })
    return claimed ? { claimToken, sync: claimed } : null
  },

  async release(input: { syncId: string; claimToken: string }) {
    await templateInstallationSyncRepository.release({
      id: input.syncId,
      claimToken: input.claimToken,
    })
  },

  async fail(input: { syncId: string; claimToken: string; errorCode: string }) {
    await templateInstallationSyncRepository.finish({
      id: input.syncId,
      claimToken: input.claimToken,
      outcome: { status: "failed", errorCode: input.errorCode },
    })
  },

  /**
   * One sync, in one bounded transaction fenced by the lease: it applies the
   * newest template version to the installed copies (see the rules in the
   * plan, P7) and commits together with the sync's outcome. Throws on any
   * error, rolling everything back; the caller classifies it.
   */
  async run(input: {
    sync: TemplateSyncRow
    claimToken: string
  }): Promise<void> {
    const { sync, claimToken } = input
    // Only to find the template to lock on; everything that decides the sync
    // is read again under the lock below.
    const probe = await templateInstallationRepository.findByIdAndWorkspace({
      id: sync.installationId,
      workspaceId: sync.workspaceId,
    })
    if (!probe?.templateId) {
      await finishSkipped(sync, claimToken, "templateInstallationInactive")
      return
    }
    const templateId = probe.templateId

    // Objects the adapters copy into storage during the transaction; deleted
    // again if it rolls back, since nothing will reference them.
    const copiedObjectPaths: string[] = []
    try {
      const applied = await applyLatestVersion({
        sync,
        claimToken,
        probe,
        templateId,
        copiedObjectPaths,
      })
      if (applied.skipped) {
        // The transaction committed only the skip: nothing references what was staged.
        await deleteCopiedObjects(copiedObjectPaths.splice(0))
      }
    } catch (error) {
      // The staged keys are per claim (`syncAttemptKey(sync.id, claimToken)`),
      // so no other attempt's rows can reference them. The one exception is
      // this claim's own commit whose acknowledgement was lost: its copies
      // reference the objects, so they stay.
      if (!(await committedCopies(sync.id, claimToken))) {
        await deleteCopiedObjects(copiedObjectPaths)
      }
      throw error
    }
    await invalidateAfterCommit(probe.workspaceId)
    // Recorded on the installation by the sync's own transaction, so the sweep
    // re-runs them if this process dies here.
    await flushPublishEffects({
      installationId: sync.installationId,
      workspaceId: probe.workspaceId,
    })
  },
}

/** The person (or token) a sync acts as, with the kind that survives a user delete. */
const actingIdentity = (
  sync: TemplateSyncRow,
  installation: SyncInstallation,
) =>
  sync.trigger === "autoUpdate"
    ? {
        installedBy: installation.installedBy,
        installedByKind: installation.installedByKind,
      }
    : { installedBy: sync.requestedBy, installedByKind: sync.requestedByKind }

type SyncInstallation = NonNullable<
  Awaited<
    ReturnType<typeof templateInstallationRepository.findByIdAndWorkspace>
  >
>

/**
 * Whether the installation still has copies a past sync left behind because
 * their adapter could not update them then (`syncedVersion` below the
 * installation's) and whose adapter can update them now. An auto-update at the
 * installation's own version still runs for those, instead of waiting for the
 * template's next version.
 */
const hasLaggingUpdatableRows = async (
  installation: { id: string; sourceVersion: number },
  tx?: DatabaseClient,
): Promise<boolean> => {
  const rows = await templateInstallationSyncRepository.listInstalledResources(
    installation.id,
    tx,
  )
  return rows.some((row) => {
    if (
      row.wasExisting ||
      row.detachedAt ||
      typeof row.syncedVersion !== "number" ||
      row.syncedVersion >= installation.sourceVersion
    ) {
      return false
    }
    const handler = getTemplateAdapter(row.category)?.sync
    return handler !== undefined && isUpdatable(handler)
  })
}

/**
 * The staging pre-phase, from an UNLOCKED read of what the transaction will
 * decide again under the lock: storage I/O must not hold a connection idle
 * inside it. Returns `undefined` when the sync looks like it will be skipped
 * (nothing is copied then); `applyVersion` falls back to staging inline, which
 * only happens if the unlocked read was stale.
 */
const stageBeforeTransaction = async (input: {
  sync: TemplateSyncRow
  claimToken: string
  installation: SyncInstallation
  templateId: string
  copiedObjectPaths: string[]
}): Promise<StagedPayload | undefined> => {
  const { sync, installation, templateId } = input
  if (
    installation.sourceDeletedAt ||
    !isActiveInstallation(installation.status) ||
    (sync.trigger === "autoUpdate" && !installation.autoUpdate)
  ) {
    return
  }
  const latest = await templateVersionRepository.findLatest(templateId)
  if (
    !latest ||
    (sync.trigger === "autoUpdate" &&
      installation.sourceVersion >= latest.version &&
      !(await hasLaggingUpdatableRows(installation)))
  ) {
    return
  }
  const parsed = parseTemplateExport(latest.payload)
  if (!parsed.ok) {
    return
  }
  const installerActor = await templateService.resolveInstallerActor({
    ...actingIdentity(sync, installation),
    workspaceId: installation.workspaceId,
  })
  if (!installerActor) {
    return
  }
  const objects = await stageSyncObjects({
    installation,
    attemptKey: syncAttemptKey(sync.id, input.claimToken),
    payload: parsed.data,
    installerActor,
    copiedObjectPaths: input.copiedObjectPaths,
  })
  return { objects, version: latest.version, hash: latest.payloadHash }
}

/** What the unlocked staging pre-phase staged, and the version it read. */
type StagedPayload = {
  objects: StagedObjects
  version: number
  hash: string
}

const MAX_STAGE_ATTEMPTS = 3

const RESTAGE_CODE = "templateSyncRestage"

const isRestage = (error: unknown): boolean =>
  error instanceof ChatbotXException && error.code === RESTAGE_CODE

type ApplyResult = { published: PublishedFlows; skipped: boolean }

/**
 * Stages outside the transaction, then applies inside it. The version is read
 * again under the lock; if the template moved on in between, the staged map
 * belongs to another version, so the attempt rolls back and stages again
 * (bounded; the last attempt stages inline under the lock instead).
 */
const applyLatestVersion = async (input: {
  sync: TemplateSyncRow
  claimToken: string
  probe: SyncInstallation
  templateId: string
  copiedObjectPaths: string[]
}): Promise<ApplyResult> => {
  const { sync, claimToken, probe, templateId, copiedObjectPaths } = input
  for (let attempt = 1; ; attempt++) {
    const staged = await stageBeforeTransaction({
      sync,
      claimToken,
      installation: probe,
      templateId,
      copiedObjectPaths,
    })
    try {
      return await applyInTransaction({
        ...input,
        staged,
        mayRestage: attempt < MAX_STAGE_ATTEMPTS,
      })
    } catch (error) {
      if (!isRestage(error)) {
        throw error
      }
      // The keys are per claim: nothing else can reference this attempt's copies.
      await deleteCopiedObjects(copiedObjectPaths.splice(0))
    }
  }
}

const applyInTransaction = async (input: {
  sync: TemplateSyncRow
  claimToken: string
  probe: SyncInstallation
  templateId: string
  copiedObjectPaths: string[]
  staged: StagedPayload | undefined
  mayRestage: boolean
}): Promise<ApplyResult> => {
  const { sync, claimToken, probe, templateId, copiedObjectPaths } = input
  return await db.transaction(async (tx) => {
    markTemplateEngineTransaction(tx)
    await setLocalStatementTimeout(tx, TEMPLATE_SYNC_STATEMENT_TIMEOUT)
    // Excludes a concurrent install request, sync or restore of the pair.
    await templateInstallationRepository.lockInstallRequest(
      { workspaceId: probe.workspaceId, sourceTemplateId: templateId },
      tx,
    )
    const skip = async (code: string): Promise<ApplyResult> => {
      // A stale worker whose lease moved on must not report a skip: its caller
      // would delete staged objects the winning attempt's rows may reference.
      if (!(await finishSkipped(sync, claimToken, code, tx))) {
        throw leaseLostException()
      }
      return { published: NO_PUBLISHED_FLOWS, skipped: true }
    }

    const installation =
      await templateInstallationRepository.findByIdAndWorkspace(
        { id: sync.installationId, workspaceId: sync.workspaceId },
        tx,
      )
    if (
      !installation ||
      installation.sourceDeletedAt ||
      !isActiveInstallation(installation.status)
    ) {
      return await skip("templateInstallationInactive")
    }
    if (
      await templateUninstallStateRepository.isInProgress(installation.id, tx)
    ) {
      return await skip("templateUninstallInProgress")
    }
    // Every copy this sync may overwrite, locked in one sorted pass before
    // anything is read or fingerprinted: a local edit racing the sync waits,
    // then diffs against the post-sync state. The install-request lock above
    // always precedes these. This is an engine transaction, so the reference
    // guards some adapters reach through services skip it; new resources have
    // no row yet and need no lock.
    await acquireTemplateResourceLocks(
      tx,
      (
        await templateInstallationSyncRepository.listInstalledResources(
          installation.id,
          tx,
        )
      )
        .filter((row) => !(row.wasExisting || row.detachedAt))
        .map((row) => ({ kind: row.resourceKind, resourceId: row.resourceId })),
    )
    const latest = await templateVersionRepository.findLatest(templateId, tx)
    if (!latest) {
      throw templateSourceMissingException()
    }
    if (sync.trigger === "autoUpdate") {
      // A queued or swept auto-update must respect what the installer chose since.
      if (!installation.autoUpdate) {
        return await skip("templateAutoUpdateOff")
      }
      if (
        installation.sourceVersion >= latest.version &&
        !(await hasLaggingUpdatableRows(installation, tx))
      ) {
        return await skip("templateUpToDate")
      }
    }
    // Never apply a payload with another version's staged objects.
    const stagedMatches =
      input.staged?.version === latest.version &&
      input.staged.hash === latest.payloadHash
    if (input.staged && !stagedMatches && input.mayRestage) {
      throw new ChatbotXException(
        "The template changed while its objects were staged",
        RESTAGE_CODE,
      )
    }
    const parsed = parseTemplateExport(latest.payload)
    if (!parsed.ok) {
      throw new ChatbotXException(
        `Template payload failed validation at sync time: ${parsed.reason}`,
        "templatePayloadIncompatible",
      )
    }
    // A sync may only write what the person behind it could have installed:
    // the member who asked, or the installer for an automatic update. A
    // token request (no member) runs with token power. The template may have
    // gained a category since the request was authorized, so this is checked
    // again against the version actually applied.
    const installerActor = await templateService.resolveInstallerActor({
      ...actingIdentity(sync, installation),
      workspaceId: installation.workspaceId,
    })
    if (!installerActor) {
      return await skip("templateInstallerAccessLost")
    }

    if (input.staged && !stagedMatches) {
      // Final fallback: the staged map belongs to another version. Its copies
      // are unreferenced once the inline staging below re-copies what this
      // version needs, so remove them first rather than leak them.
      await deleteDiscardedStagedObjects(
        input.staged.objects,
        copiedObjectPaths,
      )
    }
    const applied = await applyVersion(tx, {
      sync,
      claimToken,
      installation,
      payload: parsed.data,
      version: latest.version,
      appliedHash: latest.payloadHash,
      fromVersion: installation.sourceVersion,
      installerActor,
      copiedObjectPaths,
      // After the last restage a mismatch falls back to inline staging.
      staged: stagedMatches ? input.staged?.objects : undefined,
    })
    const finished = await templateInstallationSyncRepository.finish(
      { id: sync.id, claimToken, outcome: applied.outcome },
      tx,
    )
    if (!finished) {
      throw leaseLostException()
    }
    await templateInstallationSyncRepository.completeInstallationSync(
      { installationId: installation.id, version: latest.version },
      tx,
    )
    if (sync.trigger === "reinstall") {
      // Chatrace parity: a reinstall is an install; auto/manual syncs are not.
      await templateInstallationRepository.recordInstallEvent(
        installation.id,
        tx,
      )
    }
    await templateInstallationRepository.addPendingPublishEffects(
      { id: installation.id, effects: applied.publishedFlows },
      tx,
    )
    return { published: applied.publishedFlows, skipped: false }
  })
}

const NO_PUBLISHED_FLOWS: PublishedFlows = []

/** Deletes the staged copies of a discarded map (and forgets them for the failure cleanup). */
const deleteDiscardedStagedObjects = async (
  staged: StagedObjects,
  copiedObjectPaths: string[],
): Promise<void> => {
  const discarded = new Set(
    [...staged.values()].flatMap((object) =>
      "targetPath" in object ? [object.targetPath] : [],
    ),
  )
  if (discarded.size === 0) {
    return
  }
  await deleteCopiedObjects([...discarded])
  copiedObjectPaths.splice(
    0,
    copiedObjectPaths.length,
    ...copiedObjectPaths.filter((path) => !discarded.has(path)),
  )
}

/**
 * Whether this claim's transaction committed copies that reference its staged
 * objects (a lost COMMIT acknowledgement). A committed skip references none.
 * When the answer is unknown, the objects are kept: an orphan is harmless, a
 * copy pointing at a deleted object is not.
 */
const committedCopies = async (
  syncId: string,
  claimToken: string,
): Promise<boolean> => {
  try {
    const status =
      await templateInstallationSyncRepository.findStatusFinishedByClaim({
        id: syncId,
        claimToken,
      })
    return status !== null && status !== "skipped"
  } catch (err) {
    logger.warn(
      { err, syncId },
      "Could not tell whether the sync committed; keeping its staged objects",
    )
    return true
  }
}

const finishSkipped = async (
  sync: TemplateSyncRow,
  claimToken: string,
  errorCode: string,
  tx?: DatabaseClient,
): Promise<boolean> =>
  await templateInstallationSyncRepository.finish(
    { id: sync.id, claimToken, outcome: { status: "skipped", errorCode } },
    tx,
  )
