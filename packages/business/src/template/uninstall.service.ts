import { db } from "@chatbotx.io/database/client"
import {
  emptyTemplateUninstallCounts,
  isActiveInstallation,
  sumTemplateUninstallCounts,
  type TemplateUninstallCounts,
  type TemplateUninstallRequester,
  type TemplateUninstallState,
} from "@chatbotx.io/database/partials"
import {
  templateInstallationRepository,
  templateInstallationSyncRepository,
  templateUninstallStateRepository,
} from "@chatbotx.io/database/repositories"
import { setLocalStatementTimeout } from "@chatbotx.io/database/statement-timeout"
import { getChildLogger } from "@chatbotx.io/logger"
import { enqueueUninstallTemplate } from "@chatbotx.io/worker-config"
import { getAuditActor } from "../audit/context"
import { ChatbotXException, notFoundException } from "../errors"
import { UNINSTALL_HANDLER_BY_KIND } from "./adapters/uninstall-handlers"
import {
  assertCanManageTemplates,
  assertCanReadTemplates,
  assertCanUseTemplateCategories,
  assertCanWriteTemplateInstalls,
  type TemplateActor,
} from "./permissions"
import {
  templateUninstallInProgressException,
  templateUninstallNotGrantedException,
} from "./template-errors"
import {
  countDecisions,
  decideUninstall,
  undecidedRows,
} from "./uninstall-decide"

const log = getChildLogger("template-uninstall")

const REQUEST_STATEMENT_TIMEOUT = "30s"

/** An installation tracking more copies than a snapshot can ship is legacy or corrupt: never partly executed. */
const MAX_UNINSTALL_COPIES = 200

type Installation = NonNullable<
  Awaited<
    ReturnType<typeof templateInstallationRepository.findByIdAndWorkspace>
  >
>

/** What the request returned: poll the installation (or the grouped list) for progress. */
export type TemplateUninstallRequestResult = {
  installations: number
  operationId: string
  uninstallState: TemplateUninstallState
}

/** The advisory outcome counts of an uninstall, summed over the installer's installations. */
export type TemplateUninstallPublisherResult = {
  installations: number
  counts: TemplateUninstallCounts
}

const tooLargeException = () =>
  new ChatbotXException(
    "This installation tracks too many items to uninstall in one go",
    "templateUninstallTooLarge",
    422,
  )

const isActive = (
  installation: Installation | null,
): installation is Installation =>
  Boolean(installation) &&
  isActiveInstallation((installation as Installation).status)

/**
 * Advisory counts for one installation: what is already decided (a retry of a
 * `partial` run) plus what the decision would be now for the rest. Recomputed
 * under the locks at execution, so a preview never promises more than counts.
 */
const previewInstallation = async (input: {
  workspaceId: string
  installationId: string
}): Promise<TemplateUninstallCounts> =>
  await db.transaction(async (tx) => {
    const installation =
      await templateInstallationRepository.findByIdAndWorkspace(
        { id: input.installationId, workspaceId: input.workspaceId },
        tx,
      )
    if (!isActive(installation)) {
      throw notFoundException("Template installation not found")
    }
    const rows =
      await templateInstallationSyncRepository.listInstalledResources(
        installation.id,
        tx,
      )
    const decided = await templateUninstallStateRepository.countOutcomes(
      installation.id,
      tx,
    )
    const tombstones = await templateUninstallStateRepository.listTombstones(
      installation.id,
      MAX_UNINSTALL_COPIES + 1,
      tx,
    )
    const pending = countDecisions(
      await decideUninstall(tx, {
        installationId: installation.id,
        workspaceId: input.workspaceId,
        rows: undecidedRows(rows),
      }),
    )
    const waiting = emptyTemplateUninstallCounts()
    waiting.deleted = tombstones.length
    waiting.deletedModified = tombstones.filter(
      (row) => row.uninstallOutcome === "deletingModified",
    ).length
    waiting.deletedUnverified = tombstones.filter(
      (row) => row.uninstallOutcome === "deletingUnverified",
    ).length
    return sumTemplateUninstallCounts(
      sumTemplateUninstallCounts(decided, waiting),
      pending,
    )
  })

/**
 * Asks for the uninstall of `installations` (all one `(template, workspace)`
 * pair) as ONE operation. Phase A and B run in the worker; this only records
 * the request durably under the install-request lock, so it is the same for
 * the publisher and the installer. A repeat while an operation is in flight
 * returns that operation.
 */
const requestUninstall = async (input: {
  workspaceId: string
  installationIds: readonly string[]
  requestedByKind: TemplateUninstallRequester
  requestedBy: string | null
  actor: TemplateActor
  requireGrant: boolean
}): Promise<TemplateUninstallRequestResult> => {
  const outcome = await db.transaction(async (tx) => {
    await setLocalStatementTimeout(tx, REQUEST_STATEMENT_TIMEOUT)
    const found: Installation[] = []
    for (const id of input.installationIds) {
      const installation =
        await templateInstallationRepository.findByIdAndWorkspace(
          { id, workspaceId: input.workspaceId },
          tx,
        )
      if (!isActive(installation)) {
        throw notFoundException("Template installation not found")
      }
      found.push(installation)
    }
    const sourceTemplateId = found[0].sourceTemplateId
    if (sourceTemplateId) {
      // Excludes a concurrent install request, sync, restore or uninstall of the pair.
      await templateInstallationRepository.lockInstallRequest(
        { workspaceId: input.workspaceId, sourceTemplateId },
        tx,
      )
    }
    // Re-read under the lock: the state may have moved while we waited.
    const fresh: Installation[] = []
    for (const installation of found) {
      const current = await templateInstallationRepository.findByIdAndWorkspace(
        { id: installation.id, workspaceId: input.workspaceId },
        tx,
      )
      if (!isActive(current)) {
        throw notFoundException("Template installation not found")
      }
      if (input.requireGrant && current.publisherUninstallGrant <= 0) {
        throw templateUninstallNotGrantedException()
      }
      fresh.push(current)
    }

    const inFlight = fresh.filter((row) =>
      ["pending", "running"].includes(row.uninstallState),
    )
    if (inFlight.length > 0) {
      const operationId = inFlight[0].uninstallOperationId
      if (
        inFlight.length === fresh.length &&
        operationId &&
        inFlight.every((row) => row.uninstallOperationId === operationId)
      ) {
        return {
          operationId,
          enqueue: [] as { id: string; attempt: number }[],
          state: inFlight[0].uninstallState,
        }
      }
      throw templateUninstallInProgressException()
    }

    const categories: Record<string, number> = {}
    for (const installation of fresh) {
      const rows = (
        await templateInstallationSyncRepository.listInstalledResources(
          installation.id,
          tx,
        )
      ).filter((row) => !(row.wasExisting || row.detachedAt))
      if (
        rows.filter((row) => UNINSTALL_HANDLER_BY_KIND[row.resourceKind])
          .length > MAX_UNINSTALL_COPIES
      ) {
        throw tooLargeException()
      }
      for (const row of rows) {
        categories[row.category] = 1
      }
    }
    // Writing needs `flows` (the manage permission) plus the permission of everything it touches.
    assertCanManageTemplates(input.actor)
    assertCanUseTemplateCategories(input.actor, categories)

    const operation = await templateUninstallStateRepository.createOperation(
      {
        workspaceId: input.workspaceId,
        templateId: fresh[0].templateId,
        publisherRef: fresh[0].publisherRef,
        requestedByKind: input.requestedByKind,
        requestedBy: input.requestedBy,
      },
      tx,
    )
    const enqueue: { id: string; attempt: number }[] = []
    for (const installation of fresh) {
      const requested = await templateUninstallStateRepository.request(
        {
          id: installation.id,
          operationId: operation.id,
          requestedByKind: input.requestedByKind,
          requestedBy: input.requestedBy,
        },
        tx,
      )
      if (!requested) {
        throw templateUninstallInProgressException()
      }
      // A retry resumes the earlier decisions: only `failed` copies run again.
      await templateUninstallStateRepository.resetFailedToDeleting(
        installation.id,
        tx,
      )
      enqueue.push({ id: installation.id, attempt: requested.attempt })
    }
    return {
      operationId: operation.id,
      enqueue,
      state: "pending" as const,
    }
  })

  // After commit; a lost enqueue is recovered by the sweep (the row is the outbox).
  for (const job of outcome.enqueue) {
    try {
      await enqueueUninstallTemplate({
        installationId: job.id,
        workspaceId: input.workspaceId,
        attempt: job.attempt,
      })
    } catch (err) {
      log.warn(
        { err, installationId: job.id },
        "Could not enqueue the template uninstall; the sweep will",
      )
    }
  }
  return {
    installations: input.installationIds.length,
    operationId: outcome.operationId,
    uninstallState: outcome.state,
  }
}

/**
 * Who the audit summary names: the caller's explicit user id, else the audit
 * actor of the request (a token acts as the workspace owner). The system actor
 * is not a user row, so it is never stored.
 */
const requesterOf = (explicit: string | null | undefined): string | null => {
  if (explicit) {
    return explicit
  }
  const actor = getAuditActor()?.userId
  return actor && actor !== "system" ? actor : null
}

/**
 * Uninstalling a template from a workspace: two phases (decide + freeze +
 * tombstone, then bounded drain and delete) run by the worker. Everything the
 * install created is deleted, edited copies included (reported as
 * `deletedModified`); kept are reused items (`wasExisting`), shared manifests,
 * copies another installation locks, and copies whose deletion would destroy
 * installer data that is not itself being deleted.
 */
export const templateUninstallService = {
  /** Advisory counts of what an installer-side uninstall would do. */
  async previewAsInstaller(input: {
    workspaceId: string
    installationId: string
    actor: TemplateActor
  }): Promise<TemplateUninstallCounts> {
    // A preview only reads, so a read-only token may ask.
    return await previewInstallation(input)
  },

  async uninstallAsInstaller(input: {
    workspaceId: string
    installationId: string
    actor: TemplateActor
    requestedBy?: string | null
  }): Promise<TemplateUninstallRequestResult> {
    assertCanWriteTemplateInstalls(input.actor)
    return await requestUninstall({
      workspaceId: input.workspaceId,
      installationIds: [input.installationId],
      requestedByKind: "installer",
      requestedBy: requesterOf(input.requestedBy),
      actor: input.actor,
      requireGrant: false,
    })
  },

  /** Advisory counts of a publisher-side uninstall of one installer. */
  async previewAsPublisher(input: {
    workspaceId: string
    templateId: string
    publisherRef: string
    actor: TemplateActor
  }): Promise<TemplateUninstallPublisherResult> {
    const target = await resolvePublisherTarget(input, "read")
    let counts = emptyTemplateUninstallCounts()
    for (const installation of target.installations) {
      counts = sumTemplateUninstallCounts(
        counts,
        await previewInstallation({
          workspaceId: installation.workspaceId,
          installationId: installation.id,
        }),
      )
    }
    return { installations: target.installations.length, counts }
  },

  /**
   * The publisher removes their template from one installer's workspace.
   * Allowed only for installations whose installer granted it, from the
   * workspace that owns the template. No installation id is returned.
   */
  async uninstallAsPublisher(input: {
    workspaceId: string
    templateId: string
    publisherRef: string
    actor: TemplateActor
    requestedBy?: string | null
  }): Promise<TemplateUninstallRequestResult> {
    assertCanWriteTemplateInstalls(input.actor)
    const target = await resolvePublisherTarget(input)
    return await requestUninstall({
      workspaceId: target.installations[0].workspaceId,
      installationIds: target.installations.map((row) => row.id),
      requestedByKind: "publisher",
      requestedBy: requesterOf(input.requestedBy),
      actor: input.actor,
      requireGrant: true,
    })
  },
}

const resolvePublisherTarget = async (
  input: {
    workspaceId: string
    templateId: string
    publisherRef: string
    actor: TemplateActor
  },
  access: "read" | "write" = "write",
) => {
  if (access === "read") {
    assertCanReadTemplates(input.actor)
  } else {
    assertCanManageTemplates(input.actor)
  }
  const template = await db.query.templateModel.findFirst({
    where: {
      id: input.templateId,
      workspaceId: input.workspaceId,
      deletedAt: { isNull: true as const },
    },
    columns: { id: true, tenantId: true },
  })
  if (!template) {
    throw notFoundException("Template not found")
  }
  const installations =
    await templateInstallationRepository.listActiveByPublisherRef({
      templateId: template.id,
      publisherRef: input.publisherRef,
    })
  if (installations.length === 0) {
    throw notFoundException("Template installation not found")
  }
  if (installations.some((row) => row.publisherUninstallGrant <= 0)) {
    throw templateUninstallNotGrantedException()
  }
  // Same tenant, checked now and not only when it was installed.
  const workspace = await db.query.workspaceModel.findFirst({
    where: { id: installations[0].workspaceId },
    columns: { tenantId: true },
  })
  if (workspace?.tenantId !== template.tenantId) {
    throw notFoundException("Template installation not found")
  }
  return { template, installations }
}

export { templateUninstallCancelService } from "./uninstall-cancel.service"
export { describeUninstall } from "./uninstall-summary"
