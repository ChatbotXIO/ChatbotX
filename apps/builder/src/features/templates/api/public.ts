import { templateService } from "@chatbotx.io/business"
import type {
  TemplateInstallationModel,
  TemplateModel,
} from "@chatbotx.io/database/types"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { paginateInMemory, publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createTemplatePublicRequest,
  installTemplatePublicRequest,
  installTemplatePublicResponse,
  listSelectableTemplateResourcesPublicRequest,
  listSelectableTemplateResourcesPublicResponse,
  listTemplateInstallationsPublicResponse,
  listTemplatesPublicResponse,
  templatePublicRequestParams,
  templatePublicResource,
  updateTemplateInstallationAutoUpdatePublicRequest,
  updateTemplatePublicRequest,
  updateTemplateShareSettingsPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("workspace")

const tags = ["Templates"]

const toPublicTemplateResource = (template: TemplateModel) => ({
  id: template.id,
  name: template.name,
  description: template.description,
  imageUrl: template.imageUrl,
  publisherName: template.publisherName,
  youtubeVideoId: template.youtubeVideoId,
  testLink: template.testLink,
  shareEnabled: template.shareEnabled,
  shareToken: template.shareToken,
  shareExpiresAt: template.shareExpiresAt,
  categoryCounts: template.categoryCounts,
  createInstallFolder: template.createInstallFolder,
  defaultAutoUpdate: template.defaultAutoUpdate,
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
})

const toPublicTemplateInstallationResource = (
  installation: TemplateInstallationModel,
) => ({
  id: installation.id,
  templateId: installation.templateId,
  templateName: installation.templateName,
  status: installation.status,
  warningCount: installation.warningCount,
  errorMessage: installation.errorMessage,
  resourceCount: installation.resourceCount,
  installFolderId: installation.installFolderId,
  autoUpdate: installation.autoUpdate,
  sourceUpdatedAt: installation.sourceUpdatedAt,
  completedAt: installation.completedAt,
  createdAt: installation.createdAt,
  updatedAt: installation.updatedAt,
})

export const templatesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/templates",
      summary: "List templates",
      tags,
    })
    .input(publicListRequest)
    .output(listTemplatesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const page = paginateInMemory(
        await templateService.list(context.workspace.id),
        input,
      )
      return {
        ...page,
        data: page.data.map(toPublicTemplateResource),
      }
    }),

  listSelectableResources: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/templates/selectable-resources",
      summary: "List resources selectable for a template",
      tags,
    })
    .input(listSelectableTemplateResourcesPublicRequest)
    .output(listSelectableTemplateResourcesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await templateService.listSelectableResources({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  listInstallations: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/templates/installations",
      summary: "List template installations",
      tags,
    })
    .input(publicListRequest)
    .output(listTemplateInstallationsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const page = paginateInMemory(
        await templateService.listInstallations(context.workspace.id),
        input,
      )
      return {
        ...page,
        data: page.data.map(toPublicTemplateInstallationResource),
      }
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/templates",
      summary: "Create a template",
      successStatus: 201,
      tags,
    })
    .input(createTemplatePublicRequest)
    .output(templatePublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) =>
      toPublicTemplateResource(
        await templateService.createOrUpdate({
          ...input,
          workspaceId: context.workspace.id,
          tenantId: context.workspace.tenantId,
          createdBy: null,
        }),
      ),
    ),

  install: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/templates/installations",
      summary: "Queue a template installation",
      successStatus: 202,
      tags,
    })
    .input(installTemplatePublicRequest)
    .output(installTemplatePublicResponse)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const installation = await templateService.enqueueInstallation({
        shareToken: input.shareToken,
        workspaceId: context.workspace.id,
        installedBy: null,
      })

      return {
        installationId: installation.id,
        status: installation.status,
      }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/templates/{id}",
      summary: "Get a template",
      tags,
    })
    .input(templatePublicRequestParams)
    .output(templatePublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      toPublicTemplateResource(
        await templateService.findByIdOrFail({
          workspaceId: context.workspace.id,
          templateId: input.id,
        }),
      ),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/templates/{id}",
      summary: "Update a template",
      tags,
    })
    .input(updateTemplatePublicRequest)
    .output(templatePublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...template } = input
      return toPublicTemplateResource(
        await templateService.createOrUpdate({
          ...template,
          workspaceId: context.workspace.id,
          tenantId: context.workspace.tenantId,
          createdBy: null,
          existingTemplateId: id,
        }),
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/templates/{id}",
      summary: "Delete a template",
      successStatus: 204,
      tags,
    })
    .input(templatePublicRequestParams)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await templateService.softDelete({
        workspaceId: context.workspace.id,
        templateId: input.id,
      })
    }),

  updateShareSettings: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/templates/{id}/share-settings",
      summary: "Update a template's share settings",
      tags,
    })
    .input(updateTemplateShareSettingsPublicRequest)
    .output(templatePublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) =>
      toPublicTemplateResource(
        await templateService.updateShareSettings({
          workspaceId: context.workspace.id,
          templateId: input.id,
          shareEnabled: input.shareEnabled,
          shareExpiresAt: input.shareExpiresAt
            ? new Date(input.shareExpiresAt)
            : null,
        }),
      ),
    ),

  updateInstallationAutoUpdate: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/templates/installations/{id}/auto-update",
      summary: "Update a template installation's automatic update setting",
      successStatus: 204,
      tags,
    })
    .input(updateTemplateInstallationAutoUpdatePublicRequest)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      await templateService.updateInstallationAutoUpdate({
        workspaceId: context.workspace.id,
        installationId: input.id,
        autoUpdate: input.autoUpdate,
      })
    }),
}
