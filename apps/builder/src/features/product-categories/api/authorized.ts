import { productCategoryService } from "@chatbotx.io/business"
import { z } from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

const request = z.object({ workspaceId: z.string().regex(/^\d+$/) })

const category = z.object({
  id: z.string(),
  // Null for a top-level category. The client builds the two-level tree from
  // this flat list, so dropping the field here would silently flatten it.
  parentId: z.string().nullable(),
  name: z.string(),
  rank: z.number(),
  productCount: z.number(),
})

export const productCategoriesAuthorizedAPI = {
  listProductCategoriesAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/product-categories",
      summary: "List product categories",
      tags: ["Product Categories"],
    })
    .input(request)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(z.array(category))
    .handler(
      async ({ input }) => await productCategoryService.list(input.workspaceId),
    ),
}
