import { productService } from "@chatbotx.io/business"
import z from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listProductsRequest, listProductsResponse } from "../schema/query"
import { productFormOptionsResource } from "../schema/resource"

const listProductsAuthorizedRequest = listProductsRequest.and(
  z.object({ workspaceId: z.string() }),
)

export const productsAuthorizedAPI = {
  listProductFormOptionsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/products/form-options",
      summary: "List product form options",
      tags: ["Products"],
    })
    .input(z.object({ workspaceId: z.string().regex(/^\d+$/) }))
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(productFormOptionsResource)
    .handler(
      async ({ input }) =>
        await productService.listFormOptions(input.workspaceId),
    ),
  listProductsAuthorizedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/products",
      summary: "List products",
      tags: ["Products"],
    })
    .input(listProductsAuthorizedRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listProductsResponse)
    .handler(
      async ({ input }) =>
        await productService.list({
          ...input,
          page: input.page ?? undefined,
          perPage: input.perPage ?? undefined,
          sort: input.sort ?? undefined,
        }),
    ),
}
