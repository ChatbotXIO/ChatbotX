import type { DatabaseClient } from "@chatbotx.io/database/client"
import type {
  TemplateCategory,
  TemplateWarning,
} from "@chatbotx.io/database/partials"
import {
  type TemplateSyncRow,
  templateInstallationSyncRepository,
  templateResourceBackupRepository,
} from "@chatbotx.io/database/repositories"
import { createId } from "@chatbotx.io/utils"
import { isUpdatable } from "./adapters/shared"
import type { SyncPair } from "./adapters/types"
import { hashCanonical } from "./payload-hash"
import {
  type Adapter,
  type ApplyInput,
  type InstallCtx,
  type InstalledRow,
  kindOf,
  type Projections,
  projectionKey,
  type SyncCounts,
} from "./sync-types"

/** A backup larger than this is not taken, and its resource is left as the installer has it. */
const MAX_BACKUP_BYTES = 1024 * 1024

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
export const syncPairs = async (tx: DatabaseClient, input: SyncPairsInput) => {
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
