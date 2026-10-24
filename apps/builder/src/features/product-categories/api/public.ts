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
  listProductCategoriesPublicRequest,
  listProductCategoriesPublicResponse,
  publicProductCategoryWriteResource,
  setProductCategoryVisiblePublicRequest,
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
        "Use this to inspect the flat two-level category tree before creating one with `productCategories.create`. A null `parentId` identifies a top-level category. Pass `parentId` for one category's sub-categories, `name` to search.",
      tags: ["Product Categories"],
    })
    .input(listProductCategoriesPublicRequest)
    .output(listProductCategoriesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const data = await productCategoryService.list(
        context.workspace.id,
        input,
      )
      return { data }
    }),

  setVisible: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/product-categories/{id}/visible",
      summary: "Show or hide product category",
      description:
        "Turns the category's visibility on or off without changing anything else. Use `productCategories.list` to find its id first.",
      tags: ["Product Categories"],
    })
    .input(setProductCategoryVisiblePublicRequest)
    .output(publicProductCategoryWriteResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await productCategoryService.update({
          workspaceId: context.workspace.id,
          categoryId: input.id,
          isVisible: input.isVisible,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/product-categories",
      summary: "Create product category",
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
          imageUrl: input.imageUrl,
          isVisible: input.isVisible,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/product-categories/{id}",
      summary: "Update product category",
      description:
        "Changes an existing category's name, image, rank or visibility, or reparents it. Omitted optional fields are left as they are. Use `productCategories.list` to find its id first.",
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
        rank: data.rank,
        imageUrl: data.imageUrl,
        isVisible: data.isVisible,
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
      summary: "Delete product category",
      description:
        "Permanently deletes a product category. Use `productCategories.list` to find its id first.",
      successStatus: 204,
      tags: ["Product Categories"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Product category id. Get it from `productCategories.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await productCategoryService.delete({
        workspaceId: context.workspace.id,
        categoryId: input.id,
      })
    }),
}
