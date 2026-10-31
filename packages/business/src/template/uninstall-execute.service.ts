import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  blockedOutcomeOf,
  failedOutcomeOf,
  finalOutcomeOf,
  type TemplateUninstallOutcome,
} from "@chatbotx.io/database/partials"
import {
  templateInstallationRepository,
  templateInstallationSyncRepository,
  templateUninstallStateRepository,
} from "@chatbotx.io/database/repositories"
import { setLocalStatementTimeout } from "@chatbotx.io/database/statement-timeout"
import { getChildLogger } from "@chatbotx.io/logger"
import { createId } from "@chatbotx.io/utils"
import { ChatbotXException } from "../errors"
import { TEMPLATE_INSTALL_ORDER } from "./adapters/registry"
import { UNINSTALL_HANDLER_BY_KIND } from "./adapters/uninstall-handlers"
import { uninstallContext } from "./adapters/uninstall-kit"
import {
  isPermanentTemplateError,
  TemplateUninstallClaimLostError,
  templateUninstallNoHandlerException,
} from "./template-errors"
import {
  acquireTemplateResourceLocks,
  withTemplateLockedTransaction,
} from "./template-resource-locks"
import {
  assertNoRunningSync,
  assertPublisherStillAllowed,
  decideUninstall,
  lockKeysOf,
  persistDecisions,
  undecidedRows,
} from "./uninstall-decide"
import { runUninstallEffects } from "./uninstall-effects"
import { lockParentRows } from "./uninstall-parent-locks"
import { uninstallKey, withInboundEdgeCache } from "./uninstall-references"
import "./uninstall-effect-runners"

/**
 * Worker-only (its own package subpath, never re-exported from `index.ts`):
 * Phase B of an uninstall (bounded drain and delete of the tombstoned copies),
 * the lease, and fenced finalization. Phase A (decide, freeze, tombstone) is
 * `uninstall-decide.ts`; it commits before this ever runs.
 */
const log = getChildLogger("template-uninstall-execute")

const BATCH_SIZE = 25
const MAX_ROUNDS = 1000
const STATEMENT_TIMEOUT = "30s"
const MAX_TOMBSTONES = 1000

/** Re-exported: the worker and the tests import the lost-lease error from here. */
export { TemplateUninstallClaimLostError } from "./template-errors"

type Claim = { id: string; token: string }

/**
 * The first statements of every locked batch transaction: the statement
 * timeout, `beforeRenew` (the decision's coarse locks), then the lease renewal
 * that fences out a stale worker (it updates 0 rows and aborts).
 */
const leasedPrepare =
  (claim: Claim, beforeRenew?: (tx: DatabaseClient) => Promise<void>) =>
  async (tx: DatabaseClient): Promise<void> => {
    await setLocalStatementTimeout(tx, STATEMENT_TIMEOUT)
    await beforeRenew?.(tx)
    if (!(await templateUninstallStateRepository.renewLease(claim, tx))) {
      throw new TemplateUninstallClaimLostError()
    }
  }

const KIND_ORDER = new Map(
  [...TEMPLATE_INSTALL_ORDER]
    .reverse()
    .map((category, index) => [category, index]),
)

/** Dependents before parents: the reverse of install order, then id. */
const compareForDelete = (
  a: { category: string; resourceId: string },
  b: { category: string; resourceId: string },
): number => {
  const byCategory =
    (KIND_ORDER.get(a.category as never) ?? 0) -
    (KIND_ORDER.get(b.category as never) ?? 0)
  if (byCategory !== 0) {
    return byCategory
  }
  if (a.resourceId === b.resourceId) {
    return 0
  }
  return a.resourceId < b.resourceId ? -1 : 1
}

type Tombstone = Awaited<
  ReturnType<typeof templateUninstallStateRepository.listTombstones>
>[number]

const groupByCategoryAndKind = (rows: readonly Tombstone[]): Tombstone[][] => {
  const groups = new Map<string, Tombstone[]>()
  for (const row of rows) {
    const key = `${row.category}:${row.resourceKind}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.values()]
}

const isTransientLock = (error: unknown): boolean =>
  error instanceof ChatbotXException && error.code === "templateLockContention"

/**
 * The rows, among `rows`, something outside the deleting set still points at,
 * with the closure repeated until stable (a kept dependent keeps its parents
 * too). `deletingSet` loses the protected keys as they are found.
 */
const findProtectedRows = async (
  tx: DatabaseClient,
  workspaceId: string,
  rows: readonly Tombstone[],
  deletingSet: Set<string>,
): Promise<Tombstone[]> =>
  // The references are read once; every pass of the closure re-tests the
  // same edges against the shrinking deleting set.
  await withInboundEdgeCache(tx, () =>
    closeProtectedRows(tx, workspaceId, rows, deletingSet),
  )

const closeProtectedRows = async (
  tx: DatabaseClient,
  workspaceId: string,
  rows: readonly Tombstone[],
  deletingSet: Set<string>,
): Promise<Tombstone[]> => {
  let remaining = [...rows]
  const protectedAll: Tombstone[] = []
  for (;;) {
    const found: Tombstone[] = []
    for (const group of groupByCategoryAndKind(remaining)) {
      const handler = UNINSTALL_HANDLER_BY_KIND[group[0].resourceKind]
      const ids = await handler?.protectedDependents(
        tx,
        group.map((row) => row.resourceId),
        deletingSet,
        { workspaceId },
      )
      found.push(...group.filter((row) => ids?.has(row.resourceId)))
    }
    if (found.length === 0) {
      return protectedAll
    }
    for (const row of found) {
      deletingSet.delete(uninstallKey(row.resourceKind, row.resourceId))
    }
    protectedAll.push(...found)
    remaining = remaining.filter((row) => !found.includes(row))
  }
}

/**
 * Copies a reference reached after the decision and BEFORE any drain are kept:
 * detached as `keptHasDependents`, producers restored from the values the
 * freeze stored, cache effects recorded. Run once for the whole
 * installation (`commitUninstall`); a committed row is never re-kept.
 */
const keepRowsWithDependents = async (
  tx: DatabaseClient,
  workspaceId: string,
  installationId: string,
  rows: readonly Tombstone[],
  deletingSet: Set<string>,
): Promise<Tombstone[]> => {
  const kept = await findProtectedRows(tx, workspaceId, rows, deletingSet)
  if (kept.length === 0) {
    return []
  }
  log.warn(
    { installationId, kept: kept.length },
    "Template uninstall kept rows a reference reached after the decision",
  )
  for (const group of groupByCategoryAndKind(kept)) {
    const restored = await UNINSTALL_HANDLER_BY_KIND[
      group[0].resourceKind
    ]?.unfreeze(
      tx,
      group.map((row) => ({
        resourceId: row.resourceId,
        frozenFrom: row.uninstallFrozenFrom,
      })),
      uninstallContext(tx, workspaceId, installationId, group[0].resourceKind),
    )
    for (const row of group) {
      const effects = restored?.get(row.resourceId)
      await templateUninstallStateRepository.setOutcomes(
        {
          ids: [row.id],
          outcome: "keptHasDependents",
          effects: effects && effects.length > 0 ? [...effects] : null,
          detach: true,
        },
        tx,
      )
    }
  }
  return kept
}

/**
 * Committed rows that a holder now points at: not deleted, marked blocked
 * (the holder's data stays), reported so the installer can remove the
 * reference and retry. They stay tombstoned and frozen, and are never kept.
 */
const blockRowsWithHolders = async (
  tx: DatabaseClient,
  workspaceId: string,
  rows: readonly Tombstone[],
  deletingSet: Set<string>,
): Promise<Tombstone[]> => {
  if (rows.length === 0) {
    return []
  }
  const holders = await findProtectedRows(tx, workspaceId, rows, deletingSet)
  for (const [outcome, group] of Map.groupBy(holders, (row) =>
    blockedOutcomeOf(row.uninstallOutcome),
  )) {
    log.warn(
      { rows: group.length },
      "Template uninstall: a reference blocks the delete; not deleting",
    )
    await templateUninstallStateRepository.setOutcomes(
      { ids: group.map((row) => row.id), outcome },
      tx,
    )
  }
  return holders
}

/**
 * The point of no return: ONE decision for the whole installation. One
 * transaction holds the `tpl-res:` and parent locks of every uncommitted row,
 * runs the keep closure across all of them (a kept row keeps every row it
 * references, transitively) and commits every survivor together. Nothing is
 * drained before this commits, and later batches only touch committed rows.
 */
const commitUninstall = async (
  claim: Claim,
  workspaceId: string,
  uncommittedRows: readonly Tombstone[],
): Promise<void> => {
  await withTemplateLockedTransaction(
    async (tx) => {
      const live = await templateUninstallStateRepository.listTombstones(
        claim.id,
        MAX_TOMBSTONES,
        tx,
      )
      const uncommitted = live.filter((row) => !row.uninstallDrainStartedAt)
      if (uncommitted.length === 0) {
        return
      }
      await lockParentRows(tx, workspaceId, uncommitted)
      const deletingSet = new Set(
        live.map((row) => uninstallKey(row.resourceKind, row.resourceId)),
      )
      const kept = await keepRowsWithDependents(
        tx,
        workspaceId,
        claim.id,
        uncommitted,
        deletingSet,
      )
      await templateUninstallStateRepository.markDeleteCommitted(
        uncommitted.filter((row) => !kept.includes(row)).map((row) => row.id),
        tx,
      )
    },
    {
      initialKeys: uncommittedRows.map((row) => ({
        kind: row.resourceKind,
        resourceId: row.resourceId,
      })),
      prepare: leasedPrepare(claim),
    },
  )
}

/**
 * One bounded batch in its own transaction: renew the lease first (a stale
 * worker updates 0 rows and aborts), take the sorted `tpl-res:` locks, then
 * drain and delete per kind. Outcomes land in the same transaction.
 */
const processChunk = async (
  claim: Claim,
  workspaceId: string,
  chunk: readonly Tombstone[],
): Promise<void> => {
  await withTemplateLockedTransaction(
    async (tx) => {
      const live = new Map(
        (
          await templateUninstallStateRepository.listTombstones(
            claim.id,
            MAX_TOMBSTONES,
            tx,
          )
        ).map((row) => [row.id, row] as const),
      )
      const inBatch = chunk.flatMap((row) => {
        const current = live.get(row.id)
        return current ? [current] : []
      })
      // After the tpl-res locks: hold the parent rows, so a holder written
      // meanwhile (an FK writer with no guard of its own) waits for this
      // decision and then fails on the foreign key instead of being cascaded.
      await lockParentRows(tx, workspaceId, inBatch)
      const deletingSet = new Set(
        [...live.values()].map((row) =>
          uninstallKey(row.resourceKind, row.resourceId),
        ),
      )
      // Only committed rows drain: the point of no return was one decision
      // for the whole installation (`commitUninstall`), taken before this.
      const deletable = inBatch.filter((row) => row.uninstallDrainStartedAt)
      for (const group of groupByCategoryAndKind(deletable)) {
        const handler = UNINSTALL_HANDLER_BY_KIND[group[0].resourceKind]
        const ctx = uninstallContext(
          tx,
          workspaceId,
          claim.id,
          group[0].resourceKind,
        )
        const ids = group.map((row) => row.resourceId)
        if (!handler) {
          throw templateUninstallNoHandlerException(group[0].resourceKind)
        }
        // Every child, in bounded batches across rounds; the parent waits.
        if (await handler.drainHeavyChildren?.(tx, ids, ctx)) {
          continue
        }
        // At the parent delete, under the parent lock, once more: a holder
        // can only come from a writer that bypasses `assertReferencable`.
        // The parent is then NOT deleted (the holder's data is protected):
        // the row ends blocked, and a retry resumes here once the reference
        // is gone.
        const blocked = await blockRowsWithHolders(
          tx,
          workspaceId,
          group,
          deletingSet,
        )
        const toDelete = group.filter((row) => !blocked.includes(row))
        if (toDelete.length === 0) {
          continue
        }
        const result = await handler.uninstallDelete(
          tx,
          toDelete.map((row) => row.resourceId),
          ctx,
        )
        const byResourceId = new Map(
          toDelete.map((row) => [row.resourceId, row]),
        )
        const finish = async (
          resourceIds: readonly string[],
          outcome: (row: Tombstone) => TemplateUninstallOutcome,
        ) => {
          for (const resourceId of resourceIds) {
            const row = byResourceId.get(resourceId)
            if (!row) {
              continue
            }
            const effects = result.effects.get(resourceId)
            await templateUninstallStateRepository.setOutcomes(
              {
                ids: [row.id],
                outcome: outcome(row),
                effects: effects && effects.length > 0 ? [...effects] : null,
                detach: true,
              },
              tx,
            )
          }
        }
        await finish(result.deleted, (row) =>
          finalOutcomeOf(row.uninstallOutcome),
        )
        await finish(result.absent, () => "absent")
      }
    },
    {
      initialKeys: chunk.map((row) => ({
        kind: row.resourceKind,
        resourceId: row.resourceId,
      })),
      prepare: leasedPrepare(claim),
    },
  )
}

const markFailed = async (
  claim: Claim,
  chunk: readonly Tombstone[],
): Promise<void> => {
  await db.transaction(async (tx) => {
    if (!(await templateUninstallStateRepository.renewLease(claim, tx))) {
      throw new TemplateUninstallClaimLostError()
    }
    // The edit flag survives, so a retry still counts the copy the same way.
    const byOutcome = Map.groupBy(chunk, (row) =>
      failedOutcomeOf(row.uninstallOutcome),
    )
    for (const [outcome, rows] of byOutcome) {
      await templateUninstallStateRepository.setOutcomes(
        { ids: rows.map((row) => row.id), outcome },
        tx,
      )
    }
  })
}

/**
 * A failed commit or batch. A lost lease and a transient lock wait are
 * rethrown untouched (the caller releases). A permanent failure (no handler
 * for a kind) marks only the failing kind's rows failed and is rethrown, so
 * the worker closes the uninstall instead of retrying it forever. Anything
 * else marks the whole batch failed and the run goes on with the rest.
 */
const failBatch = async (
  claim: Claim,
  rows: readonly Tombstone[],
  error: unknown,
  phase: "commit" | "batch",
): Promise<void> => {
  if (
    error instanceof TemplateUninstallClaimLostError ||
    isTransientLock(error)
  ) {
    throw error
  }
  log.error(
    { err: error, installationId: claim.id },
    `Template uninstall ${phase} failed`,
  )
  if (
    error instanceof ChatbotXException &&
    isPermanentTemplateError(error.code)
  ) {
    const kind = error.data?.resourceKind
    await markFailed(
      claim,
      kind === undefined
        ? rows
        : rows.filter((row) => row.resourceKind === kind),
    )
    throw error
  }
  await markFailed(claim, rows)
}

/**
 * The install folders go last, only those the deletes left empty, one at a
 * time and each under a lock on that one folder. A folder that still holds
 * anything stays (it was already counted as kept) and the installer owns it.
 */
const removeInstallFolderIfEmpty = async (
  claim: Claim,
  workspaceId: string,
): Promise<void> => {
  const folders = await templateUninstallStateRepository.findInstallRoots(
    claim.id,
  )
  for (const folder of folders) {
    await withTemplateLockedTransaction(
      async (tx) => {
        const outcome =
          await templateUninstallStateRepository.deleteFolderIfEmpty(
            { workspaceId, folderId: folder.folderId },
            tx,
          )
        if (outcome === "deleted" && folder.trackedRowId) {
          await templateUninstallStateRepository.setOutcomes(
            { ids: [folder.trackedRowId], outcome: "deleted", detach: true },
            tx,
          )
        }
      },
      {
        initialKeys: [{ kind: "folder", resourceId: folder.folderId }],
        prepare: leasedPrepare(claim),
      },
    )
  }
}

/**
 * Runs the post-commit effects the deletes recorded. A failure counts an
 * attempt; at the limit the record is dropped and logged (never retried
 * forever), otherwise the sweep tries again.
 */
const flushEffects = async (installationId: string): Promise<void> => {
  const pending =
    await templateUninstallStateRepository.listPendingEffects(installationId)
  const failed: string[] = []
  for (const row of pending) {
    if (await runUninstallEffects(row.effects ?? [])) {
      await templateUninstallStateRepository.clearEffects([row.id])
    } else {
      failed.push(row.id)
    }
  }
  const givenUp =
    await templateUninstallStateRepository.bumpEffectAttempts(failed)
  if (givenUp.length > 0) {
    log.error(
      { installationId, rows: givenUp },
      "Template uninstall gave up on post-commit effects",
    )
    await templateUninstallStateRepository.clearEffects(givenUp)
    // The installer sees it on the installation, not only in a log.
    await templateUninstallStateRepository.addInstallationWarning({
      installationId,
      warning: {
        category: "settings",
        entityKind: "uninstallEffect",
        path: `installation.${installationId}`,
        value: `${givenUp.length}`,
      },
    })
  }
}

export const templateUninstallExecuteService = {
  /** The claim CAS; null means another worker holds it, it is not pending, or the workspace does not match. */
  async claim(input: {
    installationId: string
    workspaceId: string
  }): Promise<Claim | null> {
    const token = createId()
    const row = await templateUninstallStateRepository.claim({
      id: input.installationId,
      workspaceId: input.workspaceId,
      token,
    })
    return row ? { id: row.id, token } : null
  },

  /**
   * Phase A: decide every tracked copy once, in one transaction under the
   * sorted `tpl-res:` locks, with the dependency closure; tombstone what will
   * be deleted and freeze its producers. A no-op when already decided.
   */
  async decide(claim: Claim & { workspaceId: string }): Promise<void> {
    const rows =
      await templateInstallationSyncRepository.listInstalledResources(claim.id)
    if (undecidedRows(rows).length === 0) {
      return
    }
    await withTemplateLockedTransaction(
      async (tx) => {
        const fresh =
          await templateInstallationSyncRepository.listInstalledResources(
            claim.id,
            tx,
          )
        if (undecidedRows(fresh).length === 0) {
          return
        }
        // The rows were re-read inside the transaction: lock exactly what
        // Phase A will tombstone, or throw `TemplateLockSetGrownError` (the
        // wrapper retries with the grown set) so nothing is tombstoned unlocked.
        await acquireTemplateResourceLocks(tx, lockKeysOf(fresh))
        await assertNoRunningSync(tx, claim.id)
        const installation =
          await templateInstallationRepository.findByIdAndWorkspace(
            { id: claim.id, workspaceId: claim.workspaceId },
            tx,
          )
        if (installation) {
          // Before anything is tombstoned: a revoked grant stops the request.
          await assertPublisherStillAllowed(tx, installation)
        }
        // The parent rows are held while the closure reads them, so an
        // unguarded FK writer waits for the decision instead of racing it.
        await lockParentRows(
          tx,
          claim.workspaceId,
          lockKeysOf(fresh).map((key) => ({
            resourceKind: key.kind,
            resourceId: key.resourceId,
          })),
        )
        const decisions = await decideUninstall(tx, {
          installationId: claim.id,
          workspaceId: claim.workspaceId,
          rows: fresh,
        })
        await persistDecisions(
          tx,
          { workspaceId: claim.workspaceId, installationId: claim.id },
          decisions,
        )
      },
      {
        initialKeys: lockKeysOf(rows),
        // Coarse lock first, like the grant writers and the request path:
        // the advisory install-request lock, then the installation row.
        prepare: leasedPrepare(claim, async (tx) => {
          const probe =
            await templateInstallationRepository.findByIdAndWorkspace(
              { id: claim.id, workspaceId: claim.workspaceId },
              tx,
            )
          if (probe?.sourceTemplateId) {
            // Excludes a concurrent install request, sync or restore of the pair.
            await templateInstallationRepository.lockInstallRequest(
              {
                workspaceId: claim.workspaceId,
                sourceTemplateId: probe.sourceTemplateId,
              },
              tx,
            )
          }
        }),
      },
    )
    // The freeze's cache drops run now, so frozen producers stop at once.
    await flushEffects(claim.id)
  },

  /** Phase A, then Phase B and the fenced finalization. Throws on a transient failure (the caller releases). */
  async run(claim: Claim & { workspaceId: string }): Promise<void> {
    await this.decide(claim)
    let commitAttempted = false
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const rows = (
        await templateUninstallStateRepository.listTombstones(
          claim.id,
          MAX_TOMBSTONES,
        )
      ).sort(compareForDelete)
      if (rows.length === 0) {
        break
      }
      // The point of no return, taken once for the whole installation before
      // any drain; the batches below only touch rows it committed.
      const uncommitted = rows.filter((row) => !row.uninstallDrainStartedAt)
      if (!commitAttempted && uncommitted.length > 0) {
        commitAttempted = true
        try {
          await commitUninstall(claim, claim.workspaceId, uncommitted)
        } catch (error) {
          await failBatch(claim, uncommitted, error, "commit")
        }
        continue
      }
      const drainable = rows.filter((row) => row.uninstallDrainStartedAt)
      if (drainable.length === 0) {
        break
      }
      const chunk = drainable.slice(0, BATCH_SIZE)
      try {
        await processChunk(claim, claim.workspaceId, chunk)
      } catch (error) {
        await failBatch(claim, chunk, error, "batch")
      }
    }
    if (
      (await templateUninstallStateRepository.listTombstones(claim.id, 1))
        .length > 0
    ) {
      // The round budget ran out with copies still tombstoned: never `done`
      // over them. Hand the lease back; the sweep claims it and continues.
      log.warn(
        { installationId: claim.id },
        "Template uninstall needs more rounds",
      )
      await this.release(claim)
      return
    }
    const unfinished = await templateUninstallStateRepository.countOutcomes(
      claim.id,
    )
    const failed = unfinished.failed + unfinished.blockedByReference
    if (failed === 0) {
      await removeInstallFolderIfEmpty(claim, claim.workspaceId)
    }
    await this.finalize(claim)
    await flushEffects(claim.id)
  },

  /** `done` unless a delete failed (`partial`); counts come from the persisted outcomes. */
  async finalize(claim: Claim): Promise<void> {
    await db.transaction(async (tx) => {
      const counts = await templateUninstallStateRepository.countOutcomes(
        claim.id,
        tx,
      )
      const operationId = await templateUninstallStateRepository.operationIdOf(
        claim.id,
        tx,
      )
      const state =
        counts.failed + counts.blockedByReference > 0 ? "partial" : "done"
      const fenced = await templateUninstallStateRepository.finalize(
        { ...claim, state, counts },
        tx,
      )
      if (!fenced) {
        throw new TemplateUninstallClaimLostError()
      }
      await templateInstallationSyncRepository.cancelPendingSyncs(claim.id, tx)
      if (operationId) {
        await templateUninstallStateRepository.finalizeOperationIfComplete(
          operationId,
          tx,
        )
      }
    })
  },

  /** Runs leftover post-commit effects of an installation (the sweep calls it). */
  flushEffects,

  async release(claim: Claim): Promise<void> {
    await templateUninstallStateRepository.release(claim)
  },

  /** Out of retries: terminal `failed`, outcomes kept so a new request resumes. */
  async fail(claim: Claim, errorCode: string): Promise<void> {
    await db.transaction(async (tx) => {
      const counts = await templateUninstallStateRepository.countOutcomes(
        claim.id,
        tx,
      )
      const operationId = await templateUninstallStateRepository.operationIdOf(
        claim.id,
        tx,
      )
      const fenced = await templateUninstallStateRepository.finalize(
        { ...claim, state: "failed", counts, errorCode },
        tx,
      )
      if (fenced && operationId) {
        await templateUninstallStateRepository.finalizeOperationIfComplete(
          operationId,
          tx,
        )
      }
    })
  },

  /** Blocked target owner: terminal `skipped` (see the worker's `onBlocked`). */
  async skipBlocked(installationId: string): Promise<void> {
    await db.transaction(async (tx) => {
      const moved = await templateUninstallStateRepository.markSkipped(
        { id: installationId, errorCode: "workspaceOwnerBlocked" },
        tx,
      )
      if (!moved) {
        return
      }
      const operationId = await templateUninstallStateRepository.operationIdOf(
        installationId,
        tx,
      )
      if (operationId) {
        await templateUninstallStateRepository.finalizeOperationIfComplete(
          operationId,
          tx,
        )
      }
    })
  },
}
