import { productService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { withPublicPaging } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createProductPublicRequest,
  listProductsPublicResponse,
  publicProductDetailResource,
  publicProductResource,
  updateProductPublicRequest,
} from "../schema/public"
import { listProductsRequest } from "../schema/query"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

export const productsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/products",
      summary: "List products",
      tags: ["Products"],
    })
    .input(withPublicPaging(listProductsRequest.omit({ sort: true })))
    .output(listProductsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await productService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/products/{id}",
      summary: "Get a product",
      description:
        "Returns full product detail, including variant options, variants, and addons.",
      tags: ["Products"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(publicProductDetailResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await productService.findById(input.id, context.workspace.id),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/products",
      summary: "Create a product",
      tags: ["Products"],
    })
    .input(createProductPublicRequest)
    .output(publicProductResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await productService.createFull({
          workspaceId: context.workspace.id,
          ...input,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/products/{id}",
      summary: "Replace a product",
      description:
        "Fully replaces the product, including its variant options, variants, and addons.",
      tags: ["Products"],
    })
    .input(
      updateProductPublicRequest.and(z.object({ id: zodBigintAsString() })),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      await productService.updateFull({
        workspaceId: context.workspace.id,
        productId: id,
        ...data,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/products/{id}",
      summary: "Delete a product",
      successStatus: 204,
      tags: ["Products"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      // findById throws notFoundException (-> 404) for a missing id, so the
      // delete call below never silently no-ops on a nonexistent product.
      await productService.findById(input.id, context.workspace.id)
      await productService.delete({
        ids: [input.id],
        workspaceId: context.workspace.id,
      })
    }),
}
