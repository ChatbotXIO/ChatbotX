import {
  previewSelectionDependencies,
  templateService,
} from "@chatbotx.io/business"
import {
  templateCategories,
  templateResourceKinds,
  templateSelectionSchema,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listLockedTemplateResourceIds } from "../queries/list-locked-ids"
import { templateDependenciesResponse } from "../schema/public"

const listSelectableResourcesRequest = z.object({
  category: templateCategories,
  keyword: z.string().trim().max(255).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
})

const selectableResourceItemSchema = z.object({
  id: zodBigintAsString(),
  name: z.string(),
  folderName: z.string().optional(),
  badge: z.string().optional(),
})

const listSelectableResourcesResponse = z.object({
  items: z.array(selectableResourceItemSchema),
  nextCursor: z.string().nullable(),
  total: z.number(),
  allIds: z.array(zodBigintAsString()).optional(),
})

const listSelectableResourcesAPI = authorizedAPI
  .route({
    method: "GET",
    path: "/workspaces/{workspaceId}/templates/selectable-resources",
    summary: "List resources selectable for a template, by category",
    tags: ["Templates"],
  })
  .input(listSelectableResourcesRequest.and(withWorkspaceIdSchema))
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .output(listSelectableResourcesResponse)
  .handler(
    async ({ input, context }) =>
      await templateService.listSelectableResources({
        ...input,
        actor: {
          kind: "member",
          permissions: context.workspaceMember.permissions,
        },
      }),
  )

const previewDependenciesAPI = authorizedAPI
  .route({
    method: "POST",
    path: "/workspaces/{workspaceId}/templates/dependencies-preview",
    summary: "Preview what a template selection takes along",
    tags: ["Templates"],
  })
  .input(
    z.object({ selection: templateSelectionSchema }).and(withWorkspaceIdSchema),
  )
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .output(templateDependenciesResponse)
  .handler(
    async ({ input, context }) =>
      await previewSelectionDependencies({
        workspaceId: input.workspaceId,
        tenantId: context.workspace.tenantId,
        selection: input.selection,
        actor: {
          kind: "member",
          permissions: context.workspaceMember.permissions,
        },
      }),
  )

const listLockedIdsAPI = authorizedAPI
  .route({
    method: "POST",
    path: "/workspaces/{workspaceId}/templates/locked-ids",
    summary: "Which of these resources are view-only template copies",
    tags: ["Templates"],
  })
  .input(
    z
      .object({
        resourceKind: templateResourceKinds,
        resourceIds: z.array(zodBigintAsString()).max(200),
      })
      .and(withWorkspaceIdSchema),
  )
  .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
  .output(z.object({ lockedIds: z.array(z.string()) }))
  .handler(
    async ({ input }) =>
      await listLockedTemplateResourceIds({
        workspaceId: input.workspaceId,
        resourceKind: input.resourceKind,
        resourceIds: input.resourceIds,
      }),
  )

export const templatesAPI = {
  listSelectableResourcesAPI,
  previewDependenciesAPI,
  listLockedIdsAPI,
}
