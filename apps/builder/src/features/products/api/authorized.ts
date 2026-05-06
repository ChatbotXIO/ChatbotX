import z from "zod"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listProductsRequest, listProductsResponse } from "../schema/query"
import { productService } from "../services"

const listProductsAuthorizedRequest = listProductsRequest.and(
  z.object({ workspaceId: z.string() }),
)

export const productsAuthorizedAPI = {
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
    .handler(async ({ input }) => await productService.list(input)),
}
