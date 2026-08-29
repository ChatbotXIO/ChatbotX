import { templateCategories } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listSelectableResources } from "../queries/list-selectable-resources"

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
  .handler(async ({ input }) => await listSelectableResources(input))

export const templatesAPI = {
  listSelectableResourcesAPI,
}
