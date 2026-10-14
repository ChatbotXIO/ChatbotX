import { productMessageService, productService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { basePaginationRequest } from "@/lib/pagination"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listProductsRequest, listProductsResponse } from "../schema/query"
import { productFormOptionsResource } from "../schema/resource"
import {
  listSendableProductsRequest,
  listSendableProductsResponse,
  SENDABLE_PRODUCT_IDS_MAX,
} from "../schema/sendable"

const listProductsAuthorizedRequest = listProductsRequest.and(
  z.object({ workspaceId: z.string() }),
)

const listSendableProductsAuthorizedRequest =
  listSendableProductsRequest.extend({
    workspaceId: z.string().regex(/^\d+$/),
    productIds: z
      .array(zodBigintAsString())
      .max(SENDABLE_PRODUCT_IDS_MAX)
      .optional()
      .describe("Only these products."),
    page: basePaginationRequest.shape.page,
    perPage: basePaginationRequest.shape.perPage,
  })

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
  listSendableProductsAuthorizedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/products/sendable",
      summary: "List sendable products",
      tags: ["Products"],
    })
    .input(listSendableProductsAuthorizedRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listSendableProductsResponse)
    .handler(
      async ({ input }) =>
        await productMessageService.listSendable({
          ...input,
          page: input.page ?? undefined,
          perPage: input.perPage ?? undefined,
        }),
    ),
}
