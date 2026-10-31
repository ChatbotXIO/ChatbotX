import {
  templateInstallationRequestService,
  templateService,
  templateSyncRequestService,
} from "@chatbotx.io/business"
import { templateSyncRestoreService } from "@chatbotx.io/business/template-sync/restore"
import {
  templateUninstallCancelService,
  templateUninstallService,
} from "@chatbotx.io/business/template-uninstall"
import {
  templateSyncStatuses,
  templateSyncTriggers,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { readIdempotencyKey } from "../../lib/idempotency-key"
import {
  enqueueInstall,
  enqueueSync,
  requestTemplateInstall,
} from "../../lib/request-install"
import {
  cancelUninstallPublicResponse,
  getSyncPublicRequest,
  getSyncPublicResponse,
  installationDetailResponse,
  installationIdRequest,
  installTemplatePublicRequest,
  installTemplatePublicResponse,
  listInstallationResourcesRequest,
  listInstallationResourcesResponse,
  listInstallationsPublicRequest,
  listInstallationsPublicResponse,
  listSyncsPublicResponse,
  restoreBackupPublicRequest,
  syncInstallationPublicRequest,
  syncInstallationPublicResponse,
  uninstallInstallationPublicResponse,
  uninstallRequestedInstallationPublicResponse,
  updateInstallationPublicRequest,
} from "../../schema/public"
import { INSTALLATION_TAGS, tokenActor } from "./shared"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("templates")

const templateSyncStatusesSchema = z.enum(templateSyncStatuses.options)
const templateSyncTriggersSchema = z.enum(templateSyncTriggers.options)
const syncCountsSchema = z.object({
  created: z.number(),
  updated: z.number(),
  detached: z.number(),
  overwrittenModified: z.number(),
  notUpdatable: z.number(),
})

export const templateInstallationsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/template-installations",
      summary: "List template installations",
      description:
        "Templates installed into this workspace, newest first. Page with `cursor`; `activeOnly` returns just the installs still running.",
      tags: INSTALLATION_TAGS,
    })
    .input(listInstallationsPublicRequest)
    .output(listInstallationsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const page = await templateService.listInstallationsPage({
        workspaceId: context.workspace.id,
        status: input.status,
        activeOnly: input.activeOnly,
        beforeId: input.cursor,
        limit: input.limit,
      })
      return {
        items: page.items.map(
          ({ activeSync: _activeSync, uninstalledByKind, ...item }) => ({
            ...item,
            uninstalledBy: uninstalledByKind,
          }),
        ),
        nextCursor: page.nextCursor,
      }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/template-installations/{id}",
      summary: "Get template installation",
      description:
        "Status, failure code, warnings (grouped in `warningSummary`) and counts of one installation. Poll this after `templateInstallations.install` until the status is `completed`, `partial` or `failed`.",
      tags: INSTALLATION_TAGS,
    })
    .input(installationIdRequest)
    .output(installationDetailResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await templateInstallationRequestService.getDetail({
          workspaceId: context.workspace.id,
          installationId: input.id,
        }),
    ),

  install: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/template-installations",
      summary: "Install shared template",
      description:
        "Installs the template behind a share link into this workspace (same tenant only). Returns at once; the copy is made in the background, so follow it with `templateInstallations.get`. A template already installed here is updated in place to the newest version (the response then carries `syncId`) unless `allowDuplicate` is true, which installs a separate copy. Check the link first with `templatePreviews.get`.",
      tags: INSTALLATION_TAGS,
      successStatus: 202,
    })
    .input(installTemplatePublicRequest)
    .output(installTemplatePublicResponse)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await requestTemplateInstall({
          shareToken: input.shareToken,
          targetWorkspaceId: context.workspace.id,
          installedBy: null,
          actor: tokenActor(context),
          allowDuplicate: input.allowDuplicate,
          autoUpdate: input.autoUpdate,
          acceptPublisherUninstall: input.acceptPublisherUninstall,
          inboxBindings: input.inboxBindings,
          idempotencyKey: readIdempotencyKey(context),
        }),
    ),

  retry: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/template-installations/{id}/retry",
      summary: "Retry failed installation",
      description:
        "Queues a `failed` installation again. Any other status answers an error.",
      tags: INSTALLATION_TAGS,
      successStatus: 202,
    })
    .input(installationIdRequest)
    .output(installTemplatePublicResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const installation = await templateInstallationRequestService.retry({
        workspaceId: context.workspace.id,
        installationId: input.id,
        actor: tokenActor(context),
        retriedBy: null,
      })
      await enqueueInstall(installation.id, installation.workspaceId)
      return { installationId: installation.id }
    }),

  listResources: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/template-installations/{id}/resources",
      summary: "List installation resources",
      description:
        "The resources the installation created or reused, with display names and whether they are view-only. Page with `cursor`.",
      tags: INSTALLATION_TAGS,
    })
    .input(listInstallationResourcesRequest)
    .output(listInstallationResourcesResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await templateInstallationRequestService.listResources({
          workspaceId: context.workspace.id,
          installationId: input.id,
          cursor: input.cursor,
          limit: input.limit,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/template-installations/{id}",
      summary: "Update installation settings",
      description:
        "Turns auto-update on or off for one installed copy (`autoUpdate`), and grants or withdraws the publisher's right to uninstall this template from your workspace (`publisherUninstallGrant`; destructive, as an allowed uninstall deletes everything the install created, edited copies included). While auto-update is on, every save of the template that changes its contents brings this copy up to date.",
      tags: INSTALLATION_TAGS,
    })
    .input(updateInstallationPublicRequest)
    .output(z.object({ ok: z.boolean() }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      if (input.publisherUninstallGrant !== undefined) {
        await templateSyncRequestService.setPublisherUninstallGrant({
          workspaceId: context.workspace.id,
          installationId: input.id,
          actor: tokenActor(context),
          granted: input.publisherUninstallGrant,
        })
      }
      if (input.autoUpdate !== undefined) {
        await templateSyncRequestService.setAutoUpdate({
          workspaceId: context.workspace.id,
          installationId: input.id,
          actor: tokenActor(context),
          autoUpdate: input.autoUpdate,
        })
      }
      return { ok: true }
    }),

  sync: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/template-installations/{id}/sync",
      summary: "Sync installation to newest template version",
      description:
        "Brings an installed copy up to the template's newest version. Copies the installer edited are backed up first and then overwritten (`templateInstallations.restoreBackup` puts an edit back); view-only copies are overwritten. Returns at once; follow it with `templateInstallations.getSync`. A sync already running is returned instead of starting another. Check `updateAvailable` on `templateInstallations.get`.",
      tags: INSTALLATION_TAGS,
      successStatus: 202,
    })
    .input(syncInstallationPublicRequest)
    .output(syncInstallationPublicResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const requested = await templateSyncRequestService.request({
        workspaceId: context.workspace.id,
        installationId: input.id,
        actor: tokenActor(context),
        trigger: "manual",
        idempotencyKey: readIdempotencyKey(context),
      })
      await enqueueSync(requested.syncId, requested.workspaceId)
      return { syncId: requested.syncId }
    }),

  listSyncs: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/template-installations/{id}/syncs",
      summary: "List installation syncs",
      description:
        "The newest syncs of one installation (automatic, manual and reinstall), newest first.",
      tags: INSTALLATION_TAGS,
    })
    .input(installationIdRequest)
    .output(listSyncsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => ({
      items: (
        await templateSyncRequestService.list({
          workspaceId: context.workspace.id,
          installationId: input.id,
        })
      ).map(toSyncSummary),
    })),

  getSync: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/template-installations/{id}/syncs/{syncId}",
      summary: "Get installation sync",
      description:
        "One sync: its status, the versions it moved between, counts, warnings, and the backups of edited copies it overwrote. Poll after `templateInstallations.sync`.",
      tags: INSTALLATION_TAGS,
    })
    .input(getSyncPublicRequest)
    .output(getSyncPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const { sync, backups } = await templateSyncRequestService.getDetail({
        workspaceId: context.workspace.id,
        installationId: input.id,
        syncId: input.syncId,
      })
      return {
        ...toSyncSummary(sync),
        warnings: sync.warnings.map((warning) => ({
          category: warning.category,
          code: warning.entityKind,
          path: warning.path,
          value: warning.value,
        })),
        backups: backups.map((backup) => ({
          id: backup.id,
          resourceKind: backup.resourceKind,
          resourceId: backup.resourceId,
          byteSize: backup.byteSize,
        })),
      }
    }),

  previewUninstall: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/template-installations/{id}/uninstall-preview",
      summary: "Preview installation uninstall",
      description:
        "What `templateInstallations.uninstall` would do, as counts by outcome, without doing it: `deleted` (of which `deletedModified` are copies you edited, whose edits are lost for good), `keptShared`, `keptHasDependents`, `keptLockedByOther`. Advisory: decided again, under locks, when the uninstall runs.",
      tags: INSTALLATION_TAGS,
      spec: mcpSpec({ readOnlyHint: true }),
    })
    .input(installationIdRequest)
    .output(uninstallInstallationPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await templateUninstallService.previewAsInstaller({
          workspaceId: context.workspace.id,
          installationId: input.id,
          actor: tokenActor(context),
        }),
    ),

  uninstall: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/template-installations/{id}/uninstall",
      summary: "Uninstall template",
      description:
        "Starts removing the template from this workspace and returns 202; it runs in the background. Everything the install created is deleted, copies you edited included (those edits are lost and can not be restored). Kept: items that existed before, shared tags/fields/folders, copies another installation locks, and copies something you created still depends on. Preview it with `templateInstallations.previewUninstall` and follow `uninstallState` with `templateInstallations.get`. Sync, restore and reinstall are refused while it runs; request again after `partial`, `failed` or `skipped` to retry.",
      tags: INSTALLATION_TAGS,
      successStatus: 202,
      spec: mcpSpec({
        hitlPolicy: "confirm_destructive",
        destructiveHint: true,
      }),
    })
    .input(installationIdRequest)
    .output(uninstallRequestedInstallationPublicResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const requested = await templateUninstallService.uninstallAsInstaller({
        workspaceId: context.workspace.id,
        installationId: input.id,
        actor: tokenActor(context),
        requestedBy: context.workspace.ownerId,
      })
      return {
        installationId: input.id,
        operationId: requested.operationId,
        uninstallState: requested.uninstallState,
      }
    }),

  cancelUninstall: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/template-installations/{id}/uninstall/cancel",
      summary: "Cancel unfinished uninstall",
      description:
        "Takes back an uninstall that stopped part-way (`uninstallState` is `partial`, `failed` or `skipped`): the copies still waiting to be deleted are given back (their producers switched on again where nobody changed them) and the installation is an ordinary active one again. Copies already deleted stay deleted, and copies already committed to deletion are not given back (`alreadyCommitted`): they finish deleting, except those a reference blocked (`blockedByReference`), which are kept and detached (`keptPartlyRemoved`). Kinds without history come back active; flows, triggers, sequences and other kinds whose drain removed history and duplicate-protection data stay inactive (`keptInactiveForReview`): review before switching them on. Kinds with drained history but no switch (ref links, pipelines, AI files) are counted in `keptHistoryRemoved`; AI files are reindexed. Refused while the uninstall is `pending` or `running`. Not destructive.",
      tags: INSTALLATION_TAGS,
      spec: mcpSpec({ hitlPolicy: "confirm_diff" }),
    })
    .input(installationIdRequest)
    .output(cancelUninstallPublicResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const result = await templateUninstallCancelService.cancelAsInstaller({
        workspaceId: context.workspace.id,
        installationId: input.id,
        actor: tokenActor(context),
      })
      return {
        installationId: input.id,
        restored: result.restored,
        alreadyCommitted: result.alreadyCommitted,
        keptPartlyRemoved: result.keptPartlyRemoved,
        keptInactiveForReview: result.keptInactiveForReview,
        keptHistoryRemoved: result.keptHistoryRemoved,
      }
    }),

  restoreBackup: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/template-installations/{id}/backups/{backupId}/restore",
      summary: "Restore overwritten copy",
      description:
        "Puts back what a sync overwrote on an edited copy. Flows are restored into the draft only; publish them yourself. Refused while a sync of the installation is running.",
      tags: INSTALLATION_TAGS,
    })
    .input(restoreBackupPublicRequest)
    .output(z.object({ ok: z.boolean() }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await templateSyncRestoreService.restoreBackup({
        workspaceId: context.workspace.id,
        installationId: input.id,
        backupId: input.backupId,
        actor: tokenActor(context),
      })
      return { ok: true }
    }),
}

const toSyncSummary = (sync: {
  id: string
  status: z.infer<typeof templateSyncStatusesSchema>
  trigger: z.infer<typeof templateSyncTriggersSchema>
  requestedVersion: number
  fromVersion: number | null
  appliedVersion: number | null
  errorCode: string | null
  counts: z.infer<typeof syncCountsSchema> | null
  createdAt: Date
  finishedAt: Date | null
}) => ({
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
})
