import {
  type DatabaseClient,
  db,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import {
  parseTemplateUninstallCounts,
  type TemplateInstallationStatus,
  type TemplateUninstallCounts,
  type TemplateUninstallState,
} from "@chatbotx.io/database/partials"
import {
  inboxRepository,
  loadResourceLabels,
  templateInstallationRepository,
  templateInstallationSyncRepository,
  templateInstalledResourceRepository,
  templateRepository,
  templateVersionRepository,
} from "@chatbotx.io/database/repositories"
import type {
  TemplateInstallationModel,
  TemplateModel,
} from "@chatbotx.io/database/types"
import { templateInboxManifestEntrySchema } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { ChatbotXException, notFoundException } from "../errors"
import { userService } from "../user"
import {
  isBindableInbox,
  templateInvalidInboxBindingException,
} from "./adapters/manifests/inboxes"
import { canUseTemplateCategories, type TemplateActor } from "./permissions"
import {
  type PublicTemplateProjection,
  templateService,
  toPublicProjection,
} from "./service"
import { isShareLive } from "./share-live"
import {
  assertCanManagePair,
  templateSyncRequestService,
} from "./sync-request.service"
import { templateSourceMissingException } from "./template-errors"
import { templateUninstallCancelService } from "./uninstall-cancel.service"
import { describeUninstall } from "./uninstall-summary"

/**
 * The version of the "the publisher sees this workspace's name and can
 * uninstall the template" disclosure an accepted grant records. Bump it when
 * that wording changes, so a consent is always tied to the text shown.
 */
export const PUBLISHER_UNINSTALL_DISCLOSURE_VERSION = 1

export type PublisherUninstallDisclosure = {
  version: number
  publisherSees: string[]
  publisherCan: string[]
  uninstallDeletes: string
}

/** What accepting the publisher-uninstall grant allows, disclosed before an install. */
const publisherUninstallDisclosure = (): PublisherUninstallDisclosure => ({
  version: PUBLISHER_UNINSTALL_DISCLOSURE_VERSION,
  publisherSees: ["workspaceName", "installCounts", "uninstallCounts"],
  publisherCan: ["uninstall"],
  uninstallDeletes:
    "Everything the template created in this workspace, including copies you edited; anything you built on top of a copy is kept.",
})

const inboxManifestSchema = z.record(
  z.string(),
  templateInboxManifestEntrySchema,
)

const ACTIVE_UNIQUE_INDEX =
  "TemplateInstallation_workspaceId_sourceTemplateId_active_key"
const RESOURCES_PAGE_SIZE = 100
/** A detail response lists at most this many warnings; the summary counts them all. */
const MAX_DETAIL_WARNINGS = 200

export const templateAlreadyInstalledException = (installationId: string) => {
  const exception = new ChatbotXException(
    "This template is already installed in this workspace",
    "templateAlreadyInstalled",
    409,
  )
  exception.data = { installationId }
  return exception
}

const templateInstallationNotRetryableException = () =>
  new ChatbotXException(
    "Only a failed installation can be retried",
    "templateInstallationNotRetryable",
    409,
  )

/** An installation as the detail view and the API show it — never `errorMessage`, `permissions` or claim fields. */
export type TemplateInstallationDetail = {
  id: string
  templateName: string
  status: TemplateInstallationStatus
  errorCode: string | null
  resourceCount: number
  warningCount: number
  attempts: number
  /** When the latest attempt started (each retry overwrites it); the token never leaves. */
  claimedAt: Date | null
  autoUpdate: boolean
  /** The template version this copy was last brought to. */
  sourceVersion: number
  /** The template has a newer version than the copy. */
  updateAvailable: boolean
  lastSyncedAt: Date | null
  /** A sync of this copy is pending or running. */
  syncInProgress: boolean
  /** The installer lets the publisher see this workspace's name and uninstall the template. */
  publisherUninstallGrant: boolean
  installedByName: string | null
  createdAt: Date
  completedAt: Date | null
  warnings: {
    category: string
    code: string
    path: string
    value: string
  }[]
  warningSummary: { code: string; count: number }[]
  /** Who uninstalled the template and what became of the copies; null unless uninstalled. */
  uninstall: ReturnType<typeof describeUninstall>
  /** `pending` / `running` while an uninstall runs; `partial` / `failed` / `skipped` await a retry. */
  uninstallState: TemplateUninstallState
  uninstallErrorCode: string | null
  /** The counts the latest uninstall recorded (also for `partial`), null before it finishes. */
  uninstallCounts: TemplateUninstallCounts | null
}

export type TemplateInstallationResource = {
  id: string
  category: string
  resourceKind: string
  resourceId: string
  label: string | null
  created: boolean
  locked: boolean
}

export type TemplateInstallationResourcePage = {
  items: TemplateInstallationResource[]
  nextCursor: string | null
}

/** An inbox of the template's source the installer must stand in for. */
export type TemplateRequiredInbox = {
  sourceId: string
  channelType: string
  name: string
}

export type TemplatePreview =
  | {
      installable: true
      template: PublicTemplateProjection
      /** Source inboxes to bind at install time; empty when the template needs none. */
      requiredInboxes: TemplateRequiredInbox[]
      /** The distinct channels of `requiredInboxes`. */
      requiredChannels: string[]
      existingInstallation: { id: string; status: string } | null
      /** What the publisher-uninstall grant (`acceptPublisherUninstall`) allows. */
      publisherUninstallDisclosure: PublisherUninstallDisclosure
    }
  | { installable: false; reason: string }

/**
 * Rejections that must not tell a caller more than "unusable link": a token
 * that exists but belongs to another tenant would otherwise be confirmed live.
 */
const PREVIEW_REASON_BY_CODE: Record<string, string> = {
  templateShareDisabled: "templateShareDisabled",
  templateCrossTenantInstall: "templateShareDisabled",
}

class TemplateInstallationRequestService {
  /**
   * Records an install request and returns the row to enqueue. Everything
   * that decides "is this a duplicate" happens under a per-(workspace,
   * template) advisory lock, so two concurrent requests, a double click or an
   * idempotent replay all converge on one row; the partial unique index is the
   * backstop behind the lock.
   *
   * - an install already in flight is returned as is (`created: false`);
   * - an installed copy is updated in place (a `reinstall` sync, returned as
   *   `syncId`), unless the caller asked for `allowDuplicate`, which installs
   *   a separate copy;
   * - otherwise a new `pending` row is created.
   */
  async request(input: {
    shareToken: string
    targetWorkspaceId: string
    /** `null` when a workspace API token made the request. */
    installedBy: string | null
    actor: TemplateActor
    allowDuplicate?: boolean
    /** Let the publisher see this workspace's name and uninstall the template; default true. */
    acceptPublisherUninstall?: boolean
    /** For a reinstall: the installer's auto-update choice, else the template's default. */
    autoUpdate?: boolean
    /** For a reinstall: stored on the sync so a replayed request returns the same sync. */
    idempotencyKey?: string
    /** `{ sourceInboxId: targetInboxId }`, checked against the template's inboxes. */
    inboxBindings?: Readonly<Record<string, string>>
  }): Promise<{
    installation: TemplateInstallationModel
    created: boolean
    /** Set when the request updated an installed copy instead of installing. */
    syncId?: string
  }> {
    const { template, payload } = await templateService.assertInstallable({
      shareToken: input.shareToken,
      targetWorkspaceId: input.targetWorkspaceId,
      actor: input.actor,
    })
    const inboxBindings = await this.validateInboxBindings({
      workspaceId: input.targetWorkspaceId,
      bindings: input.inboxBindings,
      manifest: payload.manifests.inboxes,
    })
    const key = {
      workspaceId: input.targetWorkspaceId,
      sourceTemplateId: template.id,
    }
    let outcome: {
      installation: TemplateInstallationModel
      created: boolean
      reinstall?: boolean
    }
    try {
      outcome = await db.transaction(async (tx) => {
        await templateInstallationRepository.lockInstallRequest(key, tx)
        if (input.acceptPublisherUninstall !== undefined) {
          // An explicit choice at install time is the installer's current
          // consent for the whole pair, older copies included.
          await assertCanManagePair(key, input.actor, tx)
          await templateInstallationRepository.setPublisherUninstallGrant(
            {
              workspaceId: key.workspaceId,
              sourceTemplateId: key.sourceTemplateId,
              granted: input.acceptPublisherUninstall,
            },
            tx,
          )
          if (!input.acceptPublisherUninstall) {
            await templateUninstallCancelService.cancelPublisherUninstalls(tx, {
              workspaceId: key.workspaceId,
              sourceTemplateId: key.sourceTemplateId,
            })
          }
        }
        const active =
          await templateInstallationRepository.findActiveBySourceTemplate(
            key,
            tx,
          )
        if (active) {
          return { installation: active, created: false }
        }
        const installed =
          await templateInstallationRepository.findInstalledBySourceTemplate(
            key,
            tx,
          )
        if (installed && !input.allowDuplicate) {
          return { installation: installed, created: false, reinstall: true }
        }
        return {
          installation: await templateInstallationRepository.create(
            this.newInstallationValues(
              input,
              template,
              inboxBindings,
              await this.pinVersion(template, tx),
              await this.resolvePublisherRef(key, tx),
              await this.resolveGrant(input.acceptPublisherUninstall, key, tx),
            ),
            tx,
          ),
          created: true,
        }
      })
    } catch (error) {
      if (!isUniqueViolationError(error, ACTIVE_UNIQUE_INDEX)) {
        throw error
      }
      // Lost the race to a request that slipped past the lock: the in-flight
      // install is the one to follow, not whatever row is newest.
      const active =
        await templateInstallationRepository.findActiveBySourceTemplate(key)
      if (!active) {
        throw error
      }
      return { installation: active, created: false }
    }
    if (!outcome.reinstall) {
      return { installation: outcome.installation, created: outcome.created }
    }
    // Outside the transaction above: the sync request takes the same advisory
    // lock on its own connection and would wait on this one's.
    const sync = await templateSyncRequestService.request({
      workspaceId: input.targetWorkspaceId,
      installationId: outcome.installation.id,
      actor: input.actor,
      trigger: "reinstall",
      requestedBy: input.installedBy,
      requestedByKind: input.installedBy ? "member" : "apiToken",
      autoUpdate: input.autoUpdate,
      acceptPublisherUninstall: input.acceptPublisherUninstall,
      inboxBindings,
      idempotencyKey: input.idempotencyKey,
    })
    return {
      installation: outcome.installation,
      created: false,
      syncId: sync.syncId,
    }
  }

  /**
   * Every binding must name an inbox of the template and point at a connected
   * inbox of the target workspace on the same channel; anything else is
   * rejected up front rather than installed half-bound. Returns `null` when
   * the installer chose nothing.
   */
  private async validateInboxBindings(input: {
    workspaceId: string
    bindings: Readonly<Record<string, string>> | undefined
    manifest: Readonly<Record<string, { channelType: string; name: string }>>
  }): Promise<Record<string, string> | null> {
    const entries = Object.entries(input.bindings ?? {})
    if (entries.length === 0) {
      return null
    }
    const targets = new Map(
      (
        await inboxRepository.listIdentitiesByIds({
          workspaceId: input.workspaceId,
          ids: entries.map(([, targetId]) => targetId),
        })
      ).map((row) => [row.id, row]),
    )
    for (const [sourceId, targetId] of entries) {
      const wanted = input.manifest[sourceId]
      const target = targets.get(targetId)
      if (!(wanted && target && isBindableInbox(target, wanted))) {
        throw templateInvalidInboxBindingException(sourceId)
      }
    }
    return Object.fromEntries(entries)
  }

  /**
   * The template version this installation will apply: the one the caller
   * saw, pinned under the version lock so a concurrent save's prune can not
   * remove it before the worker reads it. Falls back to the newest stored
   * version when the caller's has been pruned in the meantime.
   */
  private async pinVersion(
    template: TemplateModel,
    tx: DatabaseClient,
  ): Promise<number> {
    await templateVersionRepository.lockVersions(template.id, tx)
    const pinned = await templateVersionRepository.find(
      { templateId: template.id, version: template.version },
      tx,
    )
    if (pinned) {
      return pinned.version
    }
    return (
      (await templateVersionRepository.findLatest(template.id, tx))?.version ??
      template.version
    )
  }

  /** Every installation of a (template, workspace) pair shares one opaque reference. */
  private async resolvePublisherRef(
    key: { workspaceId: string; sourceTemplateId: string },
    tx: DatabaseClient,
  ): Promise<string> {
    return (
      (await templateInstallationRepository.findPublisherRef(key, tx)) ??
      crypto.randomUUID().replaceAll("-", "")
    )
  }

  /**
   * The consent a new installation carries: the installer's explicit choice,
   * else what they chose before for this template (an opt-out sticks), else on.
   */
  private async resolveGrant(
    accepted: boolean | undefined,
    key: { workspaceId: string; sourceTemplateId: string },
    tx: DatabaseClient,
  ): Promise<number> {
    if (accepted !== undefined) {
      return accepted ? PUBLISHER_UNINSTALL_DISCLOSURE_VERSION : 0
    }
    const previous =
      await templateInstallationRepository.findPublisherUninstallGrant(key, tx)
    return previous === null
      ? PUBLISHER_UNINSTALL_DISCLOSURE_VERSION
      : Math.min(previous, PUBLISHER_UNINSTALL_DISCLOSURE_VERSION)
  }

  private newInstallationValues(
    input: {
      targetWorkspaceId: string
      installedBy: string | null
      acceptPublisherUninstall?: boolean
    },
    template: TemplateModel,
    inboxBindings: Record<string, string> | null,
    sourceVersion: number,
    publisherRef: string,
    publisherUninstallGrant: number,
  ) {
    return {
      id: createId(),
      workspaceId: input.targetWorkspaceId,
      templateId: template.id,
      sourceTemplateId: template.id,
      templateName: template.name,
      sourceWorkspaceId: template.workspaceId,
      formatVersion: template.formatVersion,
      status: "pending" as const,
      permissions: template.defaultPermissions,
      autoUpdate: template.defaultAutoUpdate,
      sourceUpdatedAt: template.updatedAt,
      sourceVersion,
      publisherRef,
      publisherUninstallGrant,
      installedBy: input.installedBy,
      installedByKind: input.installedBy
        ? ("member" as const)
        : ("apiToken" as const),
      inboxBindings,
    }
  }

  /**
   * Puts a `failed` installation back to `pending`; the caller re-enqueues it.
   * A retry is a new install request in everything but the row it reuses, so
   * it goes through the same gates: the template must still be shared and
   * installable by `actor`, no other install of it may be in flight, and an
   * installed copy blocks it. The retrier becomes the installing user, so the
   * worker authorizes them, not the original installer.
   */
  async retry(input: {
    installationId: string
    workspaceId: string
    actor: TemplateActor
    /** `null` when a workspace API token retries. */
    retriedBy: string | null
  }): Promise<TemplateInstallationModel> {
    const existing = await templateInstallationRepository.findByIdAndWorkspace({
      id: input.installationId,
      workspaceId: input.workspaceId,
    })
    if (!existing) {
      throw notFoundException("Template installation not found")
    }
    if (existing.status !== "failed") {
      throw templateInstallationNotRetryableException()
    }
    if (!existing.templateId) {
      throw templateSourceMissingException()
    }
    const templateId = existing.templateId
    await templateService.assertInstallableById({
      templateId,
      targetWorkspaceId: input.workspaceId,
      actor: input.actor,
    })
    const key = {
      workspaceId: input.workspaceId,
      sourceTemplateId: existing.sourceTemplateId ?? existing.templateId,
    }
    try {
      return await db.transaction(async (tx) => {
        await templateInstallationRepository.lockInstallRequest(key, tx)
        const [active, installed] = await Promise.all([
          templateInstallationRepository.findActiveBySourceTemplate(key, tx),
          templateInstallationRepository.findInstalledBySourceTemplate(key, tx),
        ])
        if (active) {
          throw templateInstallationNotRetryableException()
        }
        if (installed) {
          throw templateAlreadyInstalledException(installed.id)
        }
        // A retry installs what the template is now: the publisher may have
        // fixed what made the pinned version fail.
        await templateVersionRepository.lockVersions(templateId, tx)
        const latest = await templateVersionRepository.findLatest(
          templateId,
          tx,
        )
        const reset = await templateInstallationRepository.resetFailed(
          {
            id: input.installationId,
            workspaceId: input.workspaceId,
            installedBy: input.retriedBy,
            installedByKind: input.retriedBy ? "member" : "apiToken",
            sourceVersion: latest?.version,
          },
          tx,
        )
        if (!reset) {
          throw templateInstallationNotRetryableException()
        }
        return reset
      })
    } catch (error) {
      if (isUniqueViolationError(error, ACTIVE_UNIQUE_INDEX)) {
        throw templateInstallationNotRetryableException()
      }
      throw error
    }
  }

  async getDetail(input: {
    installationId: string
    workspaceId: string
  }): Promise<TemplateInstallationDetail> {
    const row = await templateInstallationRepository.findByIdAndWorkspace({
      id: input.installationId,
      workspaceId: input.workspaceId,
    })
    if (!row) {
      throw notFoundException("Template installation not found")
    }
    const [installer, latest, activeSync] = await Promise.all([
      row.installedBy
        ? userService.findNameAndEmail(row.installedBy)
        : undefined,
      row.templateId && !row.sourceDeletedAt
        ? templateRepository.findLiveVersion(row.templateId)
        : undefined,
      templateInstallationSyncRepository.findActiveByInstallation(row.id),
    ])
    const counts = new Map<string, number>()
    for (const warning of row.warnings) {
      counts.set(warning.entityKind, (counts.get(warning.entityKind) ?? 0) + 1)
    }
    return {
      id: row.id,
      templateName: row.templateName,
      status: row.status,
      errorCode: row.errorCode,
      resourceCount: row.resourceCount,
      warningCount: row.warningCount,
      attempts: row.attempts,
      claimedAt: row.claimedAt,
      autoUpdate: row.autoUpdate,
      sourceVersion: row.sourceVersion,
      updateAvailable: Boolean(latest && latest.version > row.sourceVersion),
      lastSyncedAt: row.lastSyncedAt,
      syncInProgress: Boolean(activeSync),
      publisherUninstallGrant: row.publisherUninstallGrant > 0,
      installedByName: installer?.name ?? null,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      warnings: row.warnings.slice(0, MAX_DETAIL_WARNINGS).map((warning) => ({
        category: warning.category,
        code: warning.entityKind,
        path: warning.path,
        value: warning.value,
      })),
      warningSummary: [...counts].map(([code, count]) => ({ code, count })),
      uninstallState: row.uninstallState,
      uninstallErrorCode: row.uninstallErrorCode,
      uninstallCounts: parseTemplateUninstallCounts(row.uninstallCounts),
      uninstall: describeUninstall({
        status: row.status,
        uninstalledAt: row.uninstalledAt,
        uninstalledByKind: row.uninstalledByKind,
        uninstallCounts: parseTemplateUninstallCounts(row.uninstallCounts),
      }),
    }
  }

  /** One keyset page of what the installation created or reused, with display names. */
  async listResources(input: {
    installationId: string
    workspaceId: string
    cursor?: string
    limit?: number
  }): Promise<TemplateInstallationResourcePage> {
    const installation =
      await templateInstallationRepository.findByIdAndWorkspace({
        id: input.installationId,
        workspaceId: input.workspaceId,
      })
    if (!installation) {
      throw notFoundException("Template installation not found")
    }
    const limit = input.limit ?? RESOURCES_PAGE_SIZE
    const { rows: page, nextCursor } =
      await templateInstalledResourceRepository.listPage({
        installationId: input.installationId,
        workspaceId: input.workspaceId,
        afterId: input.cursor,
        limit,
      })
    // Deleting the source template releases every lock it put on its copies.
    const governed =
      installation.templateId !== null && installation.sourceDeletedAt === null
    const labels = await loadResourceLabels(input.workspaceId, page)
    return {
      items: page.map((row) => ({
        id: row.id,
        category: row.category,
        resourceKind: row.resourceKind,
        resourceId: row.resourceId,
        label: labels.get(`${row.resourceKind}:${row.resourceId}`) ?? null,
        created: !row.wasExisting,
        locked:
          governed && !(row.wasExisting || row.detachedAt || row.allowEdit),
      })),
      nextCursor,
    }
  }

  /**
   * The workspaces, of a user's memberships, a share link's template can be
   * installed into: the template's tenant, with every category permission it
   * needs. The tenant is resolved here, so it never leaves the server (the
   * public projection omits it). UI convenience only: the install re-checks
   * both on the server. Empty for an unusable link.
   */
  async filterInstallableWorkspaces<
    W extends { id: string; tenantId: string },
  >(input: {
    shareToken: string
    members: readonly {
      workspace: W
      permissions: Extract<TemplateActor, { kind: "member" }>["permissions"]
    }[]
  }): Promise<W[]> {
    const template = await templateRepository.findLiveByShareToken(
      input.shareToken,
    )
    if (!(template && isShareLive(template))) {
      return []
    }
    return input.members
      .filter(
        (member) =>
          member.workspace.tenantId === template.tenantId &&
          canUseTemplateCategories(
            { kind: "member", permissions: member.permissions },
            template.categoryCounts,
          ),
      )
      .map((member) => member.workspace)
  }

  /** Workspaces (of those given) that already hold this template: the copy to update and the installer's current choices. */
  async listInstalledCopies(input: {
    shareToken: string
    workspaceIds: string[]
  }): Promise<
    Record<string, { id: string; granted: boolean; autoUpdate: boolean }>
  > {
    return Object.fromEntries(
      await templateInstallationRepository.listInstalledByShareToken(input),
    )
  }

  /**
   * The inboxes a share link's template was built around, for the install
   * page, read from the inbox manifest alone (not the whole payload). Empty for any unusable link (the page already shows the generic
   * message for those). It does not check the tenant: the caller must already
   * have limited itself to workspaces of the template's tenant, as the install
   * page does — the names it returns are for people who may install it.
   */
  async findInboxManifestByShareToken(
    shareToken: string,
  ): Promise<TemplateRequiredInbox[]> {
    const template =
      await templateRepository.findInboxManifestByShareToken(shareToken)
    if (!(template && isShareLive(template))) {
      return []
    }
    const parsed = inboxManifestSchema.safeParse(template.inboxes ?? {})
    if (!parsed.success) {
      return []
    }
    return Object.entries(parsed.data).map(([sourceId, entry]) => ({
      sourceId,
      ...entry,
    }))
  }

  /**
   * The connected inboxes of each workspace on `channels`, grouped by
   * workspace, to offer as stand-ins for a template's inboxes. One query for
   * all workspaces. Identity only: no credentials, no integration rows.
   */
  async listBindableInboxes(input: {
    workspaceIds: readonly string[]
    channels: readonly string[]
  }): Promise<Record<string, { id: string; name: string; channel: string }[]>> {
    const rows = await inboxRepository.listConnectedIdentitiesByChannels(input)
    const byWorkspace: Record<
      string,
      { id: string; name: string; channel: string }[]
    > = Object.fromEntries(input.workspaceIds.map((id) => [id, []]))
    for (const { workspaceId, id, name, channel } of rows) {
      byWorkspace[workspaceId]?.push({ id, name, channel })
    }
    return byWorkspace
  }

  /**
   * Whether `shareToken` can be installed into `targetWorkspaceId` by `actor`,
   * as data rather than an exception, so an agent (or the landing page) can
   * branch on it. Every unusable-link reason collapses into the one generic
   * code, so this is never a token-existence oracle.
   */
  async preview(input: {
    shareToken: string
    targetWorkspaceId: string
    actor: TemplateActor
  }): Promise<TemplatePreview> {
    try {
      const { template, payload } =
        await templateService.assertInstallable(input)
      const requiredInboxes = Object.entries(payload.manifests.inboxes).map(
        ([sourceId, entry]) => ({ sourceId, ...entry }),
      )
      const latest =
        await templateInstallationRepository.findLatestBySourceTemplate({
          workspaceId: input.targetWorkspaceId,
          sourceTemplateId: template.id,
        })
      return {
        installable: true,
        template: toPublicProjection(template),
        requiredInboxes,
        requiredChannels: [
          ...new Set(requiredInboxes.map((inbox) => inbox.channelType)),
        ],
        existingInstallation: latest
          ? { id: latest.id, status: latest.status }
          : null,
        publisherUninstallDisclosure: publisherUninstallDisclosure(),
      }
    } catch (error) {
      if (error instanceof ChatbotXException) {
        return {
          installable: false,
          reason: PREVIEW_REASON_BY_CODE[error.code] ?? error.code,
        }
      }
      throw error
    }
  }
}

export const templateInstallationRequestService =
  new TemplateInstallationRequestService()
