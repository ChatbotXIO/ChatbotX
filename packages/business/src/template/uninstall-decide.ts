import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  isTemplateUninstallTombstone,
  type TemplateResourceCategory,
  type TemplateResourceKind,
  type TemplateUninstallCounts,
  type TemplateUninstallOutcome,
} from "@chatbotx.io/database/partials"
import {
  templateInstallationSyncRepository,
  templateUninstallRepository,
  templateUninstallStateRepository,
} from "@chatbotx.io/database/repositories"
import { SHARED_KINDS } from "./adapters/manifests/kinds"
import { getTemplateAdapter } from "./adapters/registry"
import { UNINSTALL_HANDLER_BY_KIND } from "./adapters/uninstall-handlers"
import { uninstallContext } from "./adapters/uninstall-kit"
import { hashCanonical } from "./payload-hash"
import {
  templateUninstallInProgressException,
  templateUninstallNotGrantedException,
} from "./template-errors"
import { uninstallKey, withInboundEdgeCache } from "./uninstall-references"
import { emptyUninstallCounts } from "./uninstall-summary"

type InstalledRow = Awaited<
  ReturnType<typeof templateInstallationSyncRepository.listInstalledResources>
>[number]

/** The outcome an uninstall decides for one tracked copy. */
export type TemplateUninstallDecision = {
  row: InstalledRow
  outcome: Exclude<
    TemplateUninstallOutcome,
    "deleted" | "deletedModified" | "failed"
  >
}

const isTombstone = isTemplateUninstallTombstone

/**
 * Rows the installation still has to decide: created by it (`wasExisting` is
 * false), still governed, and with no outcome yet. A decided installation has
 * none, which is how a resumed run knows Phase A already committed.
 */
export const undecidedRows = (rows: readonly InstalledRow[]): InstalledRow[] =>
  rows.filter(
    (row) => !(row.wasExisting || row.detachedAt || row.uninstallOutcome),
  )

/**
 * A manifest kind is shared (kept) unless the row's own category copies that
 * kind: `pipeline` is both a natural-key manifest reference and a copied
 * category.
 */
const isSharedRow = (row: InstalledRow): boolean => {
  if (!SHARED_KINDS.has(row.resourceKind)) {
    return false
  }
  const adapter = getTemplateAdapter(row.category as TemplateResourceCategory)
  return adapter?.trackedKind !== row.resourceKind
}

/** What is known about a copy's edits: only used to word the confirmation and the counts. */
type EditState = "unchanged" | "modified" | "unverified"

/**
 * Whether the installer edited the copy. Everything is deleted either way;
 * this only decides what the counts may claim. A kind that has no fingerprint
 * (`updateNotSupported`), a copy with nothing to project and a copy with no
 * baseline hash are `unverified`: edits cannot be detected, so none are
 * claimed and none are denied.
 */
const editStateOf = async (
  tx: DatabaseClient,
  row: InstalledRow,
): Promise<EditState> => {
  const sync = getTemplateAdapter(
    row.category as TemplateResourceCategory,
  )?.sync
  if (!sync || sync.updatable === false || row.syncedHash === null) {
    return "unverified"
  }
  const current = await sync.project(tx, row.resourceId)
  if (current === null) {
    return "unverified"
  }
  return (await hashCanonical(current)) === row.syncedHash
    ? "unchanged"
    : "modified"
}

const TOMBSTONE_BY_EDIT_STATE: Record<
  EditState,
  "deleting" | "deletingModified" | "deletingUnverified"
> = {
  unchanged: "deleting",
  modified: "deletingModified",
  unverified: "deletingUnverified",
}

const groupByKind = (
  rows: readonly InstalledRow[],
): Map<TemplateResourceKind, InstalledRow[]> => {
  const groups = new Map<TemplateResourceKind, InstalledRow[]>()
  for (const row of rows) {
    groups.set(row.resourceKind, [...(groups.get(row.resourceKind) ?? []), row])
  }
  return groups
}

/**
 * Drops, from `candidates`, every copy something outside the deleting set
 * still depends on, and repeats until stable: a kept dependent propagates
 * "keep" to its parents. One batched query per inbound slot per pass, at most
 * |candidates| passes.
 */
const closeOverDependents = async (
  tx: DatabaseClient,
  workspaceId: string,
  candidates: Map<string, InstalledRow>,
): Promise<InstalledRow[]> => {
  const kept: InstalledRow[] = []
  // The inbound references are read once; each pass re-tests the same edges.
  return await withInboundEdgeCache(tx, async () => {
    for (;;) {
      const deletingSet = new Set(candidates.keys())
      let changed = false
      for (const [kind, rows] of groupByKind([...candidates.values()])) {
        const handler = UNINSTALL_HANDLER_BY_KIND[kind]
        if (!handler) {
          continue
        }
        const protectedIds = await handler.protectedDependents(
          tx,
          rows.map((row) => row.resourceId),
          deletingSet,
          { workspaceId },
        )
        for (const row of rows) {
          if (protectedIds.has(row.resourceId)) {
            candidates.delete(uninstallKey(kind, row.resourceId))
            kept.push(row)
            changed = true
          }
        }
      }
      if (!changed) {
        return kept
      }
    }
  })
}

/**
 * Decides, for one installation, what happens to each copy it created. The
 * caller holds the `tpl-res:` locks of the copies (Phase A) or none (a
 * preview, which is advisory and recomputed under the locks at execution).
 * Pure reads: the same function serves the preview and the execution.
 */
export const decideUninstall = async (
  tx: DatabaseClient,
  input: {
    installationId: string
    workspaceId: string
    rows: readonly InstalledRow[]
  },
): Promise<TemplateUninstallDecision[]> => {
  const decisions: TemplateUninstallDecision[] = []
  const copied: InstalledRow[] = []
  for (const row of undecidedRows(input.rows)) {
    if (isSharedRow(row) || !UNINSTALL_HANDLER_BY_KIND[row.resourceKind]) {
      decisions.push({ row, outcome: "keptShared" })
    } else {
      copied.push(row)
    }
  }

  const candidates = new Map<string, InstalledRow>()
  const editStates = new Map<string, EditState>()
  for (const row of copied) {
    const key = uninstallKey(row.resourceKind, row.resourceId)
    candidates.set(key, row)
    editStates.set(key, await editStateOf(tx, row))
  }

  // Another installation still locking a copy against deletion keeps it.
  for (const [kind, rows] of groupByKind([...candidates.values()])) {
    const blocked = await templateUninstallRepository.findDeleteBlockedByOthers(
      {
        workspaceId: input.workspaceId,
        resourceKind: kind,
        resourceIds: rows.map((row) => row.resourceId),
        excludeInstallationIds: [input.installationId],
      },
      tx,
    )
    for (const row of rows.filter((entry) => blocked.has(entry.resourceId))) {
      candidates.delete(uninstallKey(kind, row.resourceId))
      decisions.push({ row, outcome: "keptLockedByOther" })
    }
  }

  for (const row of await closeOverDependents(
    tx,
    input.workspaceId,
    candidates,
  )) {
    decisions.push({ row, outcome: "keptHasDependents" })
  }
  for (const [key, row] of candidates) {
    decisions.push({
      row,
      outcome: TOMBSTONE_BY_EDIT_STATE[editStates.get(key) ?? "unverified"],
    })
  }
  return decisions
}

/** A folder the install made only to nest its copies under (tracked under `__installRoot:<type>`). */
const isInstallRootRow = (row: InstalledRow): boolean =>
  row.resourceKind === "folder" &&
  row.sourceResourceId.startsWith("__installRoot:")

/** Counts by outcome, in the shape the final counts take (`deleted` includes `deletedModified`). */
export const countDecisions = (
  decisions: readonly TemplateUninstallDecision[],
): TemplateUninstallCounts => {
  const counts = emptyUninstallCounts()
  for (const { outcome, row } of decisions) {
    // Install roots are bookkeeping folders, not template content: they are
    // left out of the preview and of the final counts alike (`countOutcomes`).
    if (isInstallRootRow(row)) {
      continue
    }
    if (isTemplateUninstallTombstone(outcome)) {
      counts.deleted++
      if (outcome === "deletingModified") {
        counts.deletedModified++
      }
      if (outcome === "deletingUnverified") {
        counts.deletedUnverified++
      }
    } else if (outcome === "keptShared") {
      counts.keptShared++
    } else if (outcome === "keptHasDependents") {
      counts.keptHasDependents++
    } else if (outcome === "keptLockedByOther") {
      counts.keptLockedByOther++
    } else if (outcome === "absent") {
      counts.absent++
    }
  }
  return counts
}

/**
 * Phase A body, inside one locked transaction: persist every decision, detach
 * what is kept or gone, freeze the producers of what will be deleted. Final
 * once committed: a resumed run finds no undecided row and goes straight to
 * Phase B.
 */
export const persistDecisions = async (
  tx: DatabaseClient,
  input: { workspaceId: string; installationId: string },
  decisions: readonly TemplateUninstallDecision[],
): Promise<void> => {
  const byOutcome = new Map<TemplateUninstallOutcome, string[]>()
  for (const { row, outcome } of decisions) {
    byOutcome.set(outcome, [...(byOutcome.get(outcome) ?? []), row.id])
  }
  for (const [outcome, ids] of byOutcome) {
    const tombstone = isTombstone(outcome)
    await templateUninstallStateRepository.setOutcomes(
      { ids, outcome, detach: !tombstone },
      tx,
    )
  }
  const deleting = decisions.filter(({ outcome }) => isTombstone(outcome))
  for (const [kind, rows] of groupByKind(deleting.map(({ row }) => row))) {
    const prior = await UNINSTALL_HANDLER_BY_KIND[kind]?.freeze(
      tx,
      rows.map((row) => row.resourceId),
      uninstallContext(tx, input.workspaceId, input.installationId, kind),
    )
    // In the freeze's own transaction: whatever happens next, the copy can
    // get its producers back with the values they had.
    // The freeze must take effect now: its cache drops run right after Phase A commits.
    const freezeEffects = UNINSTALL_HANDLER_BY_KIND[kind]?.freezeEffects?.(
      input.workspaceId,
    )
    if (freezeEffects && freezeEffects.length > 0) {
      await templateUninstallStateRepository.setEffects(
        rows.map((row) => ({ id: row.id, effects: [...freezeEffects] })),
        tx,
      )
    }
    await templateUninstallStateRepository.setFrozenFrom(
      rows.flatMap((row) => {
        const flags = prior?.get(row.resourceId)
        return flags ? [{ id: row.id, flags }] : []
      }),
      tx,
    )
  }
}

/** A running sync owns the copies; the uninstall waits for it. */
export const assertNoRunningSync = async (
  tx: DatabaseClient,
  installationId: string,
): Promise<void> => {
  if (
    await templateInstallationSyncRepository.hasRunningSync(installationId, tx)
  ) {
    throw templateUninstallInProgressException()
  }
}

/**
 * The locks Phase A takes: only the installation's tracked COPIED resources.
 * Manifests (tags, fields, folders...) are never deleted here, and detaching
 * them only updates our own rows, so they need no `tpl-res:` lock.
 */
export const lockKeysOf = (
  rows: readonly InstalledRow[],
): { kind: TemplateResourceKind; resourceId: string }[] =>
  undecidedRows(rows)
    .filter(
      (row) => !isSharedRow(row) && UNINSTALL_HANDLER_BY_KIND[row.resourceKind],
    )
    .map((row) => ({ kind: row.resourceKind, resourceId: row.resourceId }))

/**
 * A publisher's uninstall is allowed only while the installer's grant stands
 * and the tenants still match. Re-checked under the install-request lock
 * before anything is tombstoned, so revoking the grant (or the template
 * moving out of reach) stops a request that was accepted earlier.
 */
export const assertPublisherStillAllowed = async (
  tx: DatabaseClient,
  installation: {
    uninstallRequestedByKind: string | null
    publisherUninstallGrant: number
    templateId: string | null
    workspaceId: string
  },
): Promise<void> => {
  if (installation.uninstallRequestedByKind !== "publisher") {
    return
  }
  if (installation.publisherUninstallGrant <= 0 || !installation.templateId) {
    throw templateUninstallNotGrantedException()
  }
  const [template, workspace] = await Promise.all([
    tx.query.templateModel.findFirst({
      where: {
        id: installation.templateId,
        deletedAt: { isNull: true as const },
      },
      columns: { tenantId: true },
    }),
    tx.query.workspaceModel.findFirst({
      where: { id: installation.workspaceId },
      columns: { tenantId: true },
    }),
  ])
  if (!(template && workspace) || template.tenantId !== workspace.tenantId) {
    throw templateUninstallNotGrantedException()
  }
}
