import { productCategoryService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createProductCategoryPublicRequest,
  listProductCategoriesPublicResponse,
  publicProductCategoryWriteResource,
  updateProductCategoryPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("ecommerce")

export const productCategoriesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/product-categories",
      summary: "List product categories",
      description:
        "Lists product categories as a flat two-level list. `parentId` is null for a top-level category, or the id of its top-level parent for a sub-category.",
      tags: ["Product Categories"],
    })
    .output(listProductCategoriesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context }) => {
      const data = await productCategoryService.list(context.workspace.id)
      return { data }
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/product-categories",
      summary: "Create a product category",
      description:
        "Omit `parentId` to create a top-level category, or pass an existing top-level category's id to create a sub-category.",
      tags: ["Product Categories"],
    })
    .input(createProductCategoryPublicRequest)
    .output(publicProductCategoryWriteResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await productCategoryService.create({
          workspaceId: context.workspace.id,
          name: input.name,
          rank: input.rank,
          parentId: input.parentId ?? null,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/product-categories/{id}",
      summary: "Update a product category",
      tags: ["Product Categories"],
    })
    .input(updateProductCategoryPublicRequest)
    .output(publicProductCategoryWriteResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await productCategoryService.update({
        workspaceId: context.workspace.id,
        categoryId: id,
        name: data.name,
        // Three distinct states, so absent must not collapse to null: omitting
        // `parentId` leaves the category where it is, `null` promotes it to the
        // top level, and an id files it under that parent. Coercing absent to
        // null would un-parent a sub-category on a rename-only request, and
        // would also skip the service's reparent guards, which branch on
        // `undefined`.
        ...("parentId" in data ? { parentId: data.parentId ?? null } : {}),
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/product-categories/{id}",
      summary: "Delete a product category",
      successStatus: 204,
      tags: ["Product Categories"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await productCategoryService.delete({
        workspaceId: context.workspace.id,
        categoryId: input.id,
      })
    }),
}
