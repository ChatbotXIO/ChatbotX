import {
  assertCanManageTemplates,
  previewSelectionDependencies,
  resolveTenantSettings,
  type TemplateDetail,
  templateService,
} from "@chatbotx.io/business"
import { templateUninstallService } from "@chatbotx.io/business/template-uninstall"
import { z } from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { parseShareExpiry } from "../../lib/share-expiry"
import { listLockedTemplateResourceIds } from "../../queries/list-locked-ids"
import {
  createTemplatePublicRequest,
  listLockedResourcesPublicRequest,
  listLockedResourcesResponse,
  listSelectableResourcesPublicRequest,
  listTemplateInstallersPublicRequest,
  listTemplateInstallersPublicResponse,
  listTemplatesPublicRequest,
  previewTemplateDependenciesPublicRequest,
  publicSelectableResourcesResponse,
  publicTemplateListItemResource,
  publicTemplateResource,
  publisherInstallerRequest,
  templateAnalyticsResponse,
  templateDependenciesResponse,
  templateIdRequest,
  templateLinkResponse,
  uninstallInstallerPublicResponse,
  uninstallRequestedInstallerPublicResponse,
  updateTemplatePublicRequest,
  updateTemplateSharePublicRequest,
} from "../../schema/public"
import { TAGS, tokenActor } from "./shared"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("templates")

type TemplateRow = Omit<
  TemplateDetail,
  "selection" | "shareToken" | "payloadHash"
>

const toPublicTemplateBase = (row: TemplateRow) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  imageUrl: row.imageUrl,
  publisherName: row.publisherName,
  youtubeVideoId: row.youtubeVideoId,
  testLink: row.testLink,
  defaultPermissions: row.defaultPermissions,
  createInstallFolder: row.createInstallFolder,
  defaultAutoUpdate: row.defaultAutoUpdate,
  shareEnabled: row.shareEnabled,
  shareExpiresAt: row.shareExpiresAt,
  categoryCounts: row.categoryCounts,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

const toPublicTemplate = (row: TemplateDetail) => ({
  ...toPublicTemplateBase(row),
  selection: row.selection,
})

const shareLink = async (
  workspaceId: string,
  row: {
    shareToken: string
    shareEnabled: boolean
    shareExpiresAt: Date | null
  },
) => {
  const { appUrl } = await resolveTenantSettings({ workspaceId })
  return {
    url: new URL(`/t/${row.shareToken}`, appUrl).toString(),
    shareEnabled: row.shareEnabled,
    shareExpiresAt: row.shareExpiresAt,
  }
}

export const templatesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/templates",
      summary: "List templates",
      description:
        "Templates this workspace published, newest first, with their active install count. Use the returned id with `templates.get`, `templates.getLink` or `templates.getAnalytics`. Paged: returns at most `limit` items (default and maximum 100); while `nextCursor` is not null, pass it back as `cursor` to get the next page. Without a cursor you get the first page.",
      tags: TAGS,
    })
    .input(listTemplatesPublicRequest)
    .output(
      z.object({
        items: z.array(publicTemplateListItemResource),
        nextCursor: z
          .string()
          .nullable()
          .describe(
            "Pass as `cursor` for the next page; null on the last page.",
          ),
      }),
    )
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const page = await templateService.listPage({
        workspaceId: context.workspace.id,
        cursor: input.cursor,
        limit: input.limit,
      })
      return {
        items: page.items.map((row) => ({
          ...toPublicTemplateBase(row),
          installCount: row.installCount,
        })),
        nextCursor: page.nextCursor,
      }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/templates/{id}",
      summary: "Get template",
      description:
        "A template with the selection it was saved with. The frozen snapshot itself is never returned.",
      tags: TAGS,
    })
    .input(templateIdRequest)
    .output(publicTemplateResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      toPublicTemplate(
        await templateService.getDetailOrFail({
          workspaceId: context.workspace.id,
          templateId: input.id,
        }),
      ),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/templates",
      summary: "Create template",
      description:
        'Saves a snapshot of the selected resources. `selection` maps a category to `{mode: "all"}` or `{mode: "ids", ids}`; list the ids with `templates.listSelectableResources`. Add `lockedIds` (or `lockAll`) to make items view-only for installers. The template is private until `templates.updateShare` enables the link.',
      tags: TAGS,
    })
    .input(createTemplatePublicRequest)
    .output(publicTemplateResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const saved = await templateService.createOrUpdate({
        ...input,
        workspaceId: context.workspace.id,
        tenantId: context.workspace.tenantId,
        createdBy: null,
        actor: tokenActor(context),
      })
      return toPublicTemplate(
        await templateService.getDetailOrFail({
          workspaceId: context.workspace.id,
          templateId: saved.id,
        }),
      )
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/templates/{id}",
      summary: "Update template",
      description:
        "Saves the template again and takes a new snapshot of the selected resources. Same body as `templates.create`.",
      tags: TAGS,
    })
    .input(updateTemplatePublicRequest)
    .output(publicTemplateResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...values } = input
      await templateService.createOrUpdate({
        ...values,
        workspaceId: context.workspace.id,
        tenantId: context.workspace.tenantId,
        createdBy: null,
        existingTemplateId: id,
        actor: tokenActor(context),
      })
      return toPublicTemplate(
        await templateService.getDetailOrFail({
          workspaceId: context.workspace.id,
          templateId: id,
        }),
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/templates/{id}",
      summary: "Delete template",
      description:
        "Deletes the template and its share link. Copies already installed stay where they are and stop being governed by it (their view-only locks are released).",
      tags: TAGS,
      successStatus: 204,
    })
    .input(templateIdRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await templateService.softDelete({
        workspaceId: context.workspace.id,
        templateId: input.id,
        actor: tokenActor(context),
      })
    }),

  listSelectableResources: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/templates/selectable-resources",
      summary: "List selectable template resources",
      description:
        "Resources of one category that can go into a template, with ids for `selection.<category>.ids`. Page with `cursor`.",
      tags: TAGS,
    })
    .input(listSelectableResourcesPublicRequest)
    .output(publicSelectableResourcesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await templateService.listSelectableResources({
          ...input,
          workspaceId: context.workspace.id,
          actor: tokenActor(context),
        }),
    ),

  previewDependencies: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/templates/dependencies-preview",
      summary: "Preview template selection dependencies",
      description:
        "Read only. Given the `selection` you would give `templates.create`, lists the resources that are included automatically because a selected one needs them (`includedDependencies`) and the tags, custom fields, folders and the like the template ships (`manifests`). Each `includedDependencies` row carries this workspace's `sourceId` and its display `name`. Refused like `templates.create` when any of those rows is in a category the token may not use. `droppedReferenceCount` is how many references to deleted or unshipped things the install would drop.",
      tags: TAGS,
      spec: mcpSpec({ hitlPolicy: "none", readOnlyHint: true }),
    })
    .input(previewTemplateDependenciesPublicRequest)
    .output(templateDependenciesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await previewSelectionDependencies({
          workspaceId: context.workspace.id,
          tenantId: context.workspace.tenantId,
          selection: input.selection,
          actor: tokenActor(context),
        }),
    ),

  listLockedResources: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/templates/locked-resources",
      summary: "Check which resources are view-only template copies",
      description:
        "Read only. Of the given ids of one resource kind, returns those installed from a view-only template: editing their content is refused with `templateAllowEditViolation`. Use it before editing a flow, keyword, trigger, sequence, AI agent, product or similar, with ids from that resource's own list operation.",
      tags: TAGS,
      spec: mcpSpec({ hitlPolicy: "none", readOnlyHint: true }),
    })
    .input(listLockedResourcesPublicRequest)
    .output(listLockedResourcesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await listLockedTemplateResourceIds({
          workspaceId: context.workspace.id,
          resourceKind: input.resourceKind,
          resourceIds: input.resourceIds,
        }),
    ),

  getLink: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/templates/{id}/link",
      summary: "Get template share link",
      description:
        "The link to give installers: whoever holds it can install the template, so it needs a token that can manage templates (a `read_only` token is refused). It only works while `shareEnabled` is true and before `shareExpiresAt`; turn it on with `templates.updateShare`.",
      tags: TAGS,
    })
    .input(templateIdRequest)
    .output(templateLinkResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      // The link is an install capability, so reading it is a manage-level act.
      assertCanManageTemplates(tokenActor(context))
      return await shareLink(
        context.workspace.id,
        await templateService.findByIdOrFail({
          workspaceId: context.workspace.id,
          templateId: input.id,
        }),
      )
    }),

  updateShare: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/templates/{id}/share",
      summary: "Update template share link",
      description:
        "Turns the share link on or off and sets when it expires. Omit `expiresAt` to keep the current expiry, or pass `null` to remove it. Get the link itself from `templates.getLink`.",
      tags: TAGS,
    })
    .input(updateTemplateSharePublicRequest)
    .output(templateLinkResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const template = await templateService.updateShareSettings({
        workspaceId: context.workspace.id,
        templateId: input.id,
        shareEnabled: input.enabled,
        shareExpiresAt: parseShareExpiry(input.expiresAt),
        actor: tokenActor(context),
      })
      return await shareLink(context.workspace.id, template)
    }),

  rotateShare: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/templates/{id}/share/rotate",
      summary: "Rotate template share link",
      description:
        "Issues a new link and invalidates every link shared before. The enabled switch and expiry are unchanged.",
      tags: TAGS,
    })
    .input(templateIdRequest)
    .output(templateLinkResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await shareLink(
          context.workspace.id,
          await templateService.rotateShareToken({
            workspaceId: context.workspace.id,
            templateId: input.id,
            actor: tokenActor(context),
          }),
        ),
    ),

  listInstallers: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/templates/{id}/installers",
      summary: "List template installers",
      description:
        "The workspaces that installed this template, one row per installer however many copies they hold: name, install counts, the oldest version they run and whether they follow auto-update. No workspace ids are exposed; `publisherRef` is an opaque reference. Page with `cursor`.",
      tags: TAGS,
    })
    .input(listTemplateInstallersPublicRequest)
    .output(listTemplateInstallersPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await templateService.listPublisherInstallations({
          workspaceId: context.workspace.id,
          templateId: input.id,
          actor: tokenActor(context),
          search: input.search,
          cursor: input.cursor,
          limit: input.limit,
        }),
    ),

  previewUninstallInstaller: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/templates/{id}/installers/{installerId}/uninstall-preview",
      summary: "Preview installer uninstall",
      description:
        "What `templates.uninstallInstaller` would do to one installer's copies, as counts by outcome, without doing it: `deleted` (of which `deletedModified` were edited by the installer and are lost), `keptShared`, `keptHasDependents`, `keptLockedByOther`. Only possible when the installer allowed it (`eligibleForUninstall` in `templates.listInstallers`). Advisory: decided again, under locks, when the uninstall runs.",
      tags: TAGS,
      spec: mcpSpec({ readOnlyHint: true }),
    })
    .input(publisherInstallerRequest)
    .output(uninstallInstallerPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await templateUninstallService.previewAsPublisher({
          workspaceId: context.workspace.id,
          templateId: input.id,
          publisherRef: input.installerId,
          actor: tokenActor(context),
        }),
    ),

  uninstallInstaller: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/templates/{id}/installers/{installerId}/uninstall",
      summary: "Uninstall template from installer",
      description:
        "Starts removing this template from one installer's workspace, if they allowed it. Runs in the background and returns 202: everything the install created is deleted, copies the installer edited included (their edits are lost; `templates.previewUninstallInstaller` counts them as `deletedModified`). Kept: items that existed before, shared tags/fields/folders, copies another installation locks, and copies something the installer created still depends on. Get `installerId` from the `publisherRef` of `templates.listInstallers` and follow `uninstallState` there. Requesting again after `partial`, `failed` or `skipped` retries.",
      tags: TAGS,
      successStatus: 202,
      spec: mcpSpec({
        hitlPolicy: "confirm_destructive",
        destructiveHint: true,
      }),
    })
    .input(publisherInstallerRequest)
    .output(uninstallRequestedInstallerPublicResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const requested = await templateUninstallService.uninstallAsPublisher({
        workspaceId: context.workspace.id,
        templateId: input.id,
        publisherRef: input.installerId,
        actor: tokenActor(context),
        // The token acts as the workspace owner, as every audited API write does.
        requestedBy: context.workspace.ownerId,
      })
      return {
        publisherRef: input.installerId,
        uninstallState: requested.uninstallState,
      }
    }),

  getAnalytics: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/templates/{id}/analytics",
      summary: "Get template install figures",
      description:
        "Installation counts by status and how many follow auto-update. Aggregates only: installers' workspaces are not named.",
      tags: TAGS,
    })
    .input(templateIdRequest)
    .output(templateAnalyticsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await templateService.getInstallAnalytics({
          workspaceId: context.workspace.id,
          templateId: input.id,
          actor: tokenActor(context),
        }),
    ),
}
