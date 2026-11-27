import { placeCategoryService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

const tags = ["Place Categories"]

/** Lightweight picker rows for the Find places near me flow action. */
export const placeCategoryOptionResource = z.object({
  id: zodBigintAsString(),
  name: z.string(),
})

export const placesNearMeAuthenticatedAPI = {
  listPlaceCategoryOptionsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/places-near-me/category-options",
      summary: "List place category options",
      tags,
    })
    .input(z.object({ workspaceId: zodBigintAsString() }))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.object({ data: z.array(placeCategoryOptionResource) }))
    .handler(async ({ input }) => {
      const categories = await placeCategoryService.list(input.workspaceId)
      return {
        data: categories.map((category) => ({
          id: category.id,
          name: category.name,
        })),
      }
    }),
}
