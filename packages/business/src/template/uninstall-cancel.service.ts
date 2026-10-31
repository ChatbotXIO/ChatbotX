import type { DatabaseClient } from "@chatbotx.io/database/client"
import {
  isActiveInstallation,
  type TemplateUninstallEffect,
} from "@chatbotx.io/database/partials"
import {
  templateInstallationRepository,
  templateUninstallStateRepository,
} from "@chatbotx.io/database/repositories"
import { setLocalStatementTimeout } from "@chatbotx.io/database/statement-timeout"
import { ChatbotXException, notFoundException } from "../errors"
import { UNINSTALL_HANDLER_BY_KIND } from "./adapters/uninstall-handlers"
import { noFreeze, uninstallContext } from "./adapters/uninstall-kit"
import {
  assertCanManageTemplates,
  assertCanUseTemplateCategories,
  assertCanWriteTemplateInstalls,
  type TemplateActor,
} from "./permissions"
import {
  acquireTemplateResourceLocks,
  withTemplateLockedTransaction,
} from "./template-resource-locks"

const CANCEL_STATEMENT_TIMEOUT = "30s"

type Tx = DatabaseClient

const notCancellable = () =>
  new ChatbotXException(
    "This uninstall can not be cancelled in its current state",
    "templateUninstallNotCancellable",
    409,
  )

type DoomedRow = Awaited<
  ReturnType<typeof templateUninstallStateRepository.listDoomed>
>[number]

const isCommitted = (row: DoomedRow): boolean =>
  row.uninstallDrainStartedAt !== null

/** A committed copy a reference blocked: not deleted, frozen, waiting for the installer. */
const isBlocked = (row: DoomedRow): boolean =>
  row.uninstallOutcome?.startsWith("blockedByReference") ?? false

/** True when the kind's drain removes history, dedupe or content (derived, not hand-listed). */
const hasDrainedHistory = (kind: DoomedRow["resourceKind"]): boolean =>
  (UNINSTALL_HANDLER_BY_KIND[kind]?.heavyChildren.length ?? 0) > 0

/** True when the kind has a producer flag a freeze switches off (derived from its handler). */
const hasFreezeFlag = (kind: DoomedRow["resourceKind"]): boolean => {
  const handler = UNINSTALL_HANDLER_BY_KIND[kind]
  return Boolean(handler) && handler?.freeze !== noFreeze
}

type GivenBack = {
  keptPartlyRemoved: number
  keptInactiveForReview: number
  keptHistoryRemoved: number
}

/**
 * The way out for a committed copy a reference blocks: it is kept as it is,
 * detached from the installation. A kind without a drain (a product, a
 * keyword, ...) gets its producers' prior flags back. A kind whose drain may
 * already have removed history or duplicate-protection data stays as drained:
 * with a freeze flag (flows, triggers, sequences, ...) it is left INACTIVE for
 * the installer to review and its stored flags are cleared so nothing switches
 * it on later (`keptInactiveForReview`); without one (ref links, pipelines, AI
 * files, ...) there is nothing to switch, it is only counted as
 * `keptHistoryRemoved`. A kind's own `giveBack` hook repairs derived state the
 * drain left wrong. Without this the installation would be refused for sync,
 * restore and reinstall forever.
 */
const giveBackBlocked = async (
  tx: Tx,
  installation: { id: string; workspaceId: string },
): Promise<GivenBack> => {
  const blocked = (
    await templateUninstallStateRepository.listDoomed(installation.id, tx)
  ).filter(isBlocked)
  const result: GivenBack = {
    keptPartlyRemoved: blocked.length,
    keptInactiveForReview: 0,
    keptHistoryRemoved: 0,
  }
  for (const [kind, rows] of Map.groupBy(blocked, (row) => row.resourceKind)) {
    const handler = UNINSTALL_HANDLER_BY_KIND[kind]
    const ctx = uninstallContext(
      tx,
      installation.workspaceId,
      installation.id,
      kind,
    )
    const drained = hasDrainedHistory(kind)
    const effectsById = new Map<string, readonly TemplateUninstallEffect[]>()
    if (drained) {
      if (hasFreezeFlag(kind)) {
        result.keptInactiveForReview += rows.length
      } else {
        result.keptHistoryRemoved += rows.length
      }
      await templateUninstallStateRepository.clearFrozenFrom(
        rows.map((row) => row.id),
        tx,
      )
      const repaired = await handler?.giveBack?.(
        tx,
        rows.map((row) => row.resourceId),
        ctx,
      )
      for (const [id, list] of repaired ?? []) {
        effectsById.set(id, list)
      }
    } else {
      const restored = await handler?.unfreeze(
        tx,
        rows.map((row) => ({
          resourceId: row.resourceId,
          frozenFrom: row.uninstallFrozenFrom,
        })),
        ctx,
      )
      for (const [id, list] of restored ?? []) {
        effectsById.set(id, list)
      }
    }
    for (const row of rows) {
      const effects = effectsById.get(row.resourceId)
      await templateUninstallStateRepository.setOutcomes(
        {
          ids: [row.id],
          outcome: "keptPartlyRemoved",
          effects: effects && effects.length > 0 ? [...effects] : null,
          detach: true,
        },
        tx,
      )
    }
  }
  return result
}

/**
 * Hands the doomed copies of an installation back: their producers get their
 * prior flags back (only where nobody changed them since), the cache effects
 * are recorded for after the commit, and the tombstones / failed outcomes are
 * cleared so a later uninstall decides them afresh. Copies that were deleted
 * or kept stay as they are. A copy past its point of no return (committed to
 * deletion) is NEVER handed back: it stays tombstoned and frozen until it is
 * deleted, and is counted as `alreadyCommitted`. The caller holds the
 * install-request lock.
 */
const undoDecisions = async (
  tx: Tx,
  installation: { id: string; workspaceId: string },
  options: { locksHeld?: boolean } = {},
): Promise<{ restored: number; alreadyCommitted: number }> => {
  const doomed = await templateUninstallStateRepository.listDoomed(
    installation.id,
    tx,
  )
  const alreadyCommitted = doomed.filter(isCommitted).length
  const giveBack = doomed.filter((row) => !isCommitted(row))
  if (giveBack.length === 0) {
    return { restored: 0, alreadyCommitted }
  }
  if (!options.locksHeld) {
    await acquireTemplateResourceLocks(
      tx,
      giveBack.map((row) => ({
        kind: row.resourceKind,
        resourceId: row.resourceId,
      })),
    )
  }
  const effects: { id: string; effects: TemplateUninstallEffect[] }[] = []
  for (const [kind, rows] of Map.groupBy(giveBack, (row) => row.resourceKind)) {
    const restored = await UNINSTALL_HANDLER_BY_KIND[kind]?.unfreeze(
      tx,
      rows.map((row) => ({
        resourceId: row.resourceId,
        frozenFrom: row.uninstallFrozenFrom,
      })),
      uninstallContext(tx, installation.workspaceId, installation.id, kind),
    )
    for (const row of rows) {
      const list = restored?.get(row.resourceId)
      if (list && list.length > 0) {
        effects.push({ id: row.id, effects: [...list] })
      }
    }
  }
  await templateUninstallStateRepository.untombstone(installation.id, tx)
  await templateUninstallStateRepository.setEffects(effects, tx)
  return { restored: giveBack.length, alreadyCommitted }
}

/**
 * Cancelling an uninstall that stopped part-way (`partial`, `failed`,
 * `skipped`) and the publisher-grant revocation that stops one that has not
 * started: both give back copies that were not yet committed to deletion, and
 * leave the committed ones to finish.
 */
export const templateUninstallCancelService = {
  /**
   * The installer takes an unfinished uninstall back. What was already deleted
   * stays deleted and counted; every copy still waiting AND not yet committed
   * is untombstoned and unfrozen. If committed copies remain the installation
   * stays unfinished (a retry deletes them); otherwise it is an ordinary
   * active installation again.
   */
  async cancelAsInstaller(input: {
    workspaceId: string
    installationId: string
    actor: TemplateActor
  }): Promise<{
    restored: number
    alreadyCommitted: number
    keptPartlyRemoved: number
    keptInactiveForReview: number
    keptHistoryRemoved: number
  }> {
    assertCanWriteTemplateInstalls(input.actor)
    assertCanManageTemplates(input.actor)
    const probe = await templateInstallationRepository.findByIdAndWorkspace({
      id: input.installationId,
      workspaceId: input.workspaceId,
    })
    if (!probe) {
      throw notFoundException("Template installation not found")
    }
    const doomed = await templateUninstallStateRepository.listDoomed(probe.id)
    return await withTemplateLockedTransaction(
      async (tx) => {
        const installation =
          await templateInstallationRepository.findByIdAndWorkspace(
            { id: probe.id, workspaceId: input.workspaceId },
            tx,
          )
        if (
          !(
            installation &&
            isActiveInstallation(installation.status) &&
            ["partial", "failed", "skipped"].includes(
              installation.uninstallState,
            )
          )
        ) {
          throw notCancellable()
        }
        // The same category check the request makes, under the lock, for what
        // is given back: a member without the permission can not re-activate it.
        const returning = (
          await templateUninstallStateRepository.listDoomed(installation.id, tx)
        ).filter((row) => !isCommitted(row) || isBlocked(row))
        assertCanUseTemplateCategories(
          input.actor,
          Object.fromEntries(returning.map((row) => [row.category, 1])),
        )
        const kept = await giveBackBlocked(tx, installation)
        const result = {
          ...(await undoDecisions(tx, installation)),
          ...kept,
        }
        if (result.alreadyCommitted === 0) {
          await templateUninstallStateRepository.markCancelled(
            installation.id,
            tx,
          )
        }
        return result
      },
      {
        initialKeys: doomed
          .filter((row) => !isCommitted(row) || isBlocked(row))
          .map((row) => ({
            kind: row.resourceKind,
            resourceId: row.resourceId,
          })),
        prepare: async (tx) => {
          await setLocalStatementTimeout(tx, CANCEL_STATEMENT_TIMEOUT)
          if (probe.sourceTemplateId) {
            await templateInstallationRepository.lockInstallRequest(
              {
                workspaceId: input.workspaceId,
                sourceTemplateId: probe.sourceTemplateId,
              },
              tx,
            )
          }
        },
      },
    )
  },

  /**
   * The installer revoked the publisher's grant: a publisher uninstall nobody
   * has claimed yet is cancelled, and if its Phase A already tombstoned and
   * froze copies, those are given back, unless some are committed to deletion
   * already: such an installation is left to finish (the grant stood when it
   * was decided). A run a worker already holds finishes the same way.
   */
  async cancelPublisherUninstalls(
    tx: Tx,
    pair: { workspaceId: string; sourceTemplateId: string },
  ): Promise<{ alreadyCommitted: number }> {
    const pending =
      await templateUninstallStateRepository.listPendingPublisherUninstalls(
        pair,
        tx,
      )
    // Every cancellable installation's keys are gathered and taken in ONE
    // sorted pass: a second acquisition in this transaction would need a lock
    // the first did not have and could never be taken late.
    const candidates: {
      id: string
      operationId: string | null
      doomed: DoomedRow[]
    }[] = []
    let alreadyCommitted = 0
    for (const row of pending) {
      const doomed = await templateUninstallStateRepository.listDoomed(
        row.id,
        tx,
      )
      if (doomed.some(isCommitted)) {
        alreadyCommitted += doomed.filter(isCommitted).length
        continue
      }
      candidates.push({ ...row, doomed })
    }
    const keys = candidates.flatMap((candidate) =>
      candidate.doomed.map((row) => ({
        kind: row.resourceKind,
        resourceId: row.resourceId,
      })),
    )
    if (keys.length > 0) {
      await acquireTemplateResourceLocks(tx, keys)
    }
    const operationIds = new Set<string>()
    for (const candidate of candidates) {
      if (
        !(await templateUninstallStateRepository.skipPending(
          candidate.id,
          "templateUninstallNotGranted",
          tx,
        ))
      ) {
        continue
      }
      await undoDecisions(
        tx,
        { id: candidate.id, workspaceId: pair.workspaceId },
        { locksHeld: true },
      )
      if (candidate.operationId) {
        operationIds.add(candidate.operationId)
      }
    }
    for (const operationId of operationIds) {
      await templateUninstallStateRepository.finalizeOperationIfComplete(
        operationId,
        tx,
      )
    }
    return { alreadyCommitted }
  },
}
