import {
  type DatabaseClient,
  db,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import {
  parseTemplateUninstallCounts,
  type TemplateCategory,
  type TemplateInstallationStatus,
  type TemplateInstallSource,
  type TemplateResourceKind,
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
  WorkspaceMemberModel,
} from "@chatbotx.io/database/types"
import { templateInboxManifestEntrySchema } from "@chatbotx.io/flow-config"
import { z } from "zod"
import { ChatbotXException, notFoundException } from "../errors"
import { userService } from "../user"
import { isWorkspaceAdminMember } from "../workspace-member/predicates"
import {
  isBindableInbox,
  templateInvalidInboxBindingException,
} from "./adapters/manifests/inboxes"
import type { PredictedAction } from "./collision-policy"
import {
  type PredictedCollision,
  previewInstallCollisions,
} from "./install-preview"
import {
  buildInstallationValues,
  newPublisherRef,
  PUBLISHER_UNINSTALL_DISCLOSURE_VERSION,
} from "./installation-values"
import { assertCanViewInstallation } from "./installation-visibility"
import {
  assertCanWriteTemplateInstalls,
  canUseTemplateCategories,
  type TemplateActor,
} from "./permissions"
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
import { canInstallFromTenant, isCrossTenantCopy } from "./tenant-gate"
import { templateUninstallCancelService } from "./uninstall-cancel.service"
import { describeUninstall } from "./uninstall-summary"
import {
  countInstallerWarnings,
  loadInstallationWarningGroups,
  type TemplateInstallationWarningGroup,
} from "./warning-groups"

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
  /** The publisher deleted the template: the copy can no longer be updated. */
  sourceDeleted: boolean
  lastSyncedAt: Date | null
  /** A sync of this copy is pending or running. */
  syncInProgress: boolean
  /** The installer lets the publisher see this workspace's name and uninstall the template. */
  publisherUninstallGrant: boolean
  installedByName: string | null
  installSource: TemplateInstallSource
  createdAt: Date
  completedAt: Date | null
  warnings: {
    category: string
    code: string
    path: string
    value: string
  }[]
  warningSummary: { code: string; count: number }[]
  /** The warnings the installer can act on, one entry per affected resource. */
  warningGroups: TemplateInstallationWarningGroup[]
  installerWarningCount: number
  /** What the installation holds per category, in the order they were installed. */
  resourceSummary: TemplateInstallationResourceSummary[]
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
  category: TemplateCategory
  resourceKind: TemplateResourceKind
  resourceId: string
  label: string | null
  created: boolean
  locked: boolean
}

export type TemplateInstallationResourceSummary = {
  category: TemplateCategory
  total: number
  created: number
  reused: number
  warnings: number
}

export type TemplateInstallationResourcePage = {
  items: TemplateInstallationResource[]
  nextCursor: string | null
}

/** An inbox of the template's source the installer must stand in for. */
/** A connected inbox of the installing workspace that can stand in for a template's. */
export type TemplateBindableInbox = {
  id: string
  name: string
  channel: string
}

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
      existingInstallation: {
        id: string
        status: TemplateInstallationStatus
      } | null
      /** What the publisher-uninstall grant (`acceptPublisherUninstall`) allows. */
      publisherUninstallDisclosure: PublisherUninstallDisclosure
    }
  | { installable: false; reason: string }

type PreviewInput = {
  shareToken: string
  targetWorkspaceId: string
  actor: TemplateActor
}

type InstallablePreview = Extract<TemplatePreview, { installable: true }>
type RejectedPreview = Extract<TemplatePreview, { installable: false }>

export type TemplatePreviewWithCollisions =
  | (InstallablePreview & {
      collisions: PredictedCollision[]
      collisionSummary: Record<PredictedAction, number>
    })
  | RejectedPreview

type LoadedPreview =
  | {
      preview: InstallablePreview
      source: Awaited<ReturnType<typeof templateService.assertInstallable>>
    }
  | { preview: RejectedPreview; source?: undefined }

/**
 * Rejections that must not tell a caller more than "unusable link": a token
 * that exists but belongs to another tenant would otherwise be confirmed live.
 */
const PREVIEW_REASON_BY_CODE: Record<string, string> = {
  templateShareDisabled: "templateShareDisabled",
  templateCrossTenantInstall: "templateShareDisabled",
}

const summarizeResources = (
  rows: readonly { category: TemplateCategory; wasExisting: boolean }[],
  warnings: readonly { category: string }[],
): TemplateInstallationResourceSummary[] =>
  [...Map.groupBy(rows, (row) => row.category)].map(([category, items]) => {
    const reused = items.filter((item) => item.wasExisting).length
    return {
      category,
      total: items.length,
      created: items.length - reused,
      reused,
      warnings: warnings.filter((warning) => warning.category === category)
        .length,
    }
  })

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
    // A template with no categories needs no category permission, so the
    // write check can not be left to them.
    assertCanWriteTemplateInstalls(input.actor)
    const { template, payload, targetTenantId } =
      await templateService.assertInstallable({
        shareToken: input.shareToken,
        targetWorkspaceId: input.targetWorkspaceId,
        actor: input.actor,
      })
    // A platform template installed into a white-label tenant is a cross-tenant
    // copy: its publisher never sees the workspace, whatever the installer ticked.
    const acceptPublisherUninstall = isCrossTenantCopy({
      templateTenantId: template.tenantId,
      targetTenantId,
    })
      ? false
      : input.acceptPublisherUninstall
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
        const active =
          await templateInstallationRepository.findActiveBySourceTemplate(
            key,
            tx,
          )
        const installed = active
          ? undefined
          : await templateInstallationRepository.findInstalledBySourceTemplate(
              key,
              tx,
            )
        // A reinstall is a sync: its request applies the choice, after it has
        // checked the request is not a replay of an older one.
        if (installed && !input.allowDuplicate) {
          return { installation: installed, created: false, reinstall: true }
        }
        await applyInstallConsent(
          key,
          acceptPublisherUninstall,
          input.actor,
          tx,
        )
        if (active) {
          return { installation: active, created: false }
        }
        return {
          installation: await templateInstallationRepository.create(
            buildInstallationValues(template, {
              workspaceId: input.targetWorkspaceId,
              sourceVersion: await templateVersionRepository.pinVersionNumber(
                { templateId: template.id, requestedVersion: template.version },
                tx,
              ),
              publisherRef: await this.resolvePublisherRef(key, tx),
              publisherUninstallGrant: await this.resolveGrant(
                acceptPublisherUninstall,
                key,
                tx,
              ),
              installedBy: input.installedBy,
              installSource: "manual",
              inboxBindings,
            }),
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
      acceptPublisherUninstall,
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

  /** Every installation of a (template, workspace) pair shares one opaque reference. */
  private async resolvePublisherRef(
    key: { workspaceId: string; sourceTemplateId: string },
    tx: DatabaseClient,
  ): Promise<string> {
    return (
      (await templateInstallationRepository.findPublisherRef(key, tx)) ??
      newPublisherRef()
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
    assertCanWriteTemplateInstalls(input.actor)
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
    /** Who looks: a member lacking a category the installation holds gets not found. */
    actor: TemplateActor
  }): Promise<TemplateInstallationDetail> {
    const row = await templateInstallationRepository.findByIdAndWorkspace({
      id: input.installationId,
      workspaceId: input.workspaceId,
    })
    if (!row) {
      throw notFoundException("Template installation not found")
    }
    await assertCanViewInstallation(row, input.actor)
    const [installer, latest, activeSync, installedCategories, warningGroups] =
      await Promise.all([
        row.installedBy
          ? userService.findNameAndEmail(row.installedBy)
          : undefined,
        row.templateId && !row.sourceDeletedAt
          ? templateRepository.findLiveVersion(row.templateId)
          : undefined,
        templateInstallationSyncRepository.findActiveByInstallation(row.id),
        templateInstalledResourceRepository.listCategories({
          installationId: row.id,
          workspaceId: input.workspaceId,
        }),
        loadInstallationWarningGroups(
          row.sourceWorkspaceId,
          row.warnings,
          "installer",
        ),
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
      sourceDeleted: Boolean(row.sourceDeletedAt) || !row.templateId,
      lastSyncedAt: row.lastSyncedAt,
      syncInProgress: Boolean(activeSync),
      publisherUninstallGrant: row.publisherUninstallGrant > 0,
      installedByName: installer?.name ?? null,
      installSource: row.installSource,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
      warnings: row.warnings.slice(0, MAX_DETAIL_WARNINGS).map((warning) => ({
        category: warning.category,
        code: warning.entityKind,
        path: warning.path,
        value: warning.value,
      })),
      warningSummary: [...counts].map(([code, count]) => ({ code, count })),
      warningGroups,
      installerWarningCount: countInstallerWarnings(row.warnings),
      resourceSummary: summarizeResources(installedCategories, row.warnings),
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
    /** Only this category's resources. */
    category?: TemplateCategory
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
        category: input.category,
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
      role: WorkspaceMemberModel["role"]
      permissions: Extract<TemplateActor, { kind: "member" }>["permissions"]
    }[]
  }): Promise<(W & { crossTenant: boolean })[]> {
    const template = await templateRepository.findLiveByShareToken(
      input.shareToken,
    )
    if (!(template && isShareLive(template))) {
      return []
    }
    return input.members
      .filter(
        (member) =>
          // Installing writes across the workspace: its owner or an admin only.
          isWorkspaceAdminMember(member) &&
          // Never the template's own workspace: its resources are already there.
          member.workspace.id !== template.workspaceId &&
          canInstallFromTenant({
            templateTenantId: template.tenantId,
            targetTenantId: member.workspace.tenantId,
          }) &&
          canUseTemplateCategories(
            { kind: "member", permissions: member.permissions },
            template.categoryCounts,
          ),
      )
      .map((member) => ({
        ...member.workspace,
        // A platform template going into a white-label workspace: its
        // publisher is never given access, so the installer is not asked.
        crossTenant: isCrossTenantCopy({
          templateTenantId: template.tenantId,
          targetTenantId: member.workspace.tenantId,
        }),
      }))
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
  }): Promise<Record<string, TemplateBindableInbox[]>> {
    const rows = await inboxRepository.listConnectedIdentitiesByChannels(input)
    const byWorkspace: Record<string, TemplateBindableInbox[]> =
      Object.fromEntries(input.workspaceIds.map((id) => [id, []]))
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
  async preview(input: PreviewInput): Promise<TemplatePreview> {
    return (await this.loadPreview(input)).preview
  }

  /** The preview plus what the install would do, from one read of the snapshot. */
  async previewWithCollisions(
    input: PreviewInput,
  ): Promise<TemplatePreviewWithCollisions> {
    const { preview, source } = await this.loadPreview(input)
    if (!source) {
      return preview
    }
    const { collisions, summary } = await previewInstallCollisions({
      workspaceId: input.targetWorkspaceId,
      manifests: source.payload.manifests,
      botFields: source.payload.resources.settings.botFields,
      createInstallFolder: source.template.createInstallFolder,
    })
    return { ...preview, collisions, collisionSummary: summary }
  }

  private async loadPreview(input: PreviewInput): Promise<LoadedPreview> {
    try {
      const source = await templateService.assertInstallable(input)
      const { template, payload } = source
      const requiredInboxes = Object.entries(payload.manifests.inboxes).map(
        ([sourceId, entry]) => ({ sourceId, ...entry }),
      )
      const latest =
        await templateInstallationRepository.findLatestBySourceTemplate({
          workspaceId: input.targetWorkspaceId,
          sourceTemplateId: template.id,
        })
      return {
        source,
        preview: {
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
        },
      }
    } catch (error) {
      if (error instanceof ChatbotXException) {
        return {
          preview: {
            installable: false,
            reason: PREVIEW_REASON_BY_CODE[error.code] ?? error.code,
          },
        }
      }
      throw error
    }
  }
}

/**
 * An explicit choice at install time is the installer's current consent for
 * the whole pair, older copies included. No choice leaves it as it is.
 */
const applyInstallConsent = async (
  pair: { workspaceId: string; sourceTemplateId: string },
  accepted: boolean | undefined,
  actor: TemplateActor,
  tx: DatabaseClient,
): Promise<void> => {
  if (accepted === undefined) {
    return
  }
  await assertCanManagePair(pair, actor, tx)
  await templateInstallationRepository.setPublisherUninstallGrant(
    { ...pair, granted: accepted },
    tx,
  )
  if (!accepted) {
    await templateUninstallCancelService.cancelPublisherUninstalls(tx, pair)
  }
}

export const templateInstallationRequestService =
  new TemplateInstallationRequestService()
