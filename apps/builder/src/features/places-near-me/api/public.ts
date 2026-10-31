import {
  placeCategoryService,
  placeLocationService,
} from "@chatbotx.io/business"
import {
  possibleErrorsOnCreatingPlaceCategory,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingPlaceCategory,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createPlaceCategoryPublicRequest,
  createPlaceLocationPublicRequest,
  deletePlaceCategoryPublicResponse,
  listPlaceCategoriesPublicResponse,
  listPlaceLocationsPublicRequest,
  listPlaceLocationsPublicResponse,
  placeCategoryIdPublicRequest,
  placeCategoryWriteResource,
  placeLocationIdPublicRequest,
  placeLocationResource,
  updatePlaceCategoryPublicRequest,
  updatePlaceLocationPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("places")

export const placeCategoriesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/place-categories",
      summary: "List place categories",
      description:
        "Categories a place location can be assigned to with `categoryId` on `placeLocations.create`/`placeLocations.update`, with how many locations each has. Rank: lower number is higher priority.",
      tags: ["Place Categories"],
    })
    .output(listPlaceCategoriesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context }) => ({
      data: await placeCategoryService.list(context.workspace.id),
    })),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/place-categories/{id}",
      summary: "Get place category",
      description:
        "Returns one category without its location count. Get the id from `placeCategories.list`; use that list when you also need how many locations each category has.",
      tags: ["Place Categories"],
    })
    .input(placeCategoryIdPublicRequest)
    .output(placeCategoryWriteResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await placeCategoryService.find({
          workspaceId: context.workspace.id,
          categoryId: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/place-categories",
      summary: "Create place category",
      description:
        "Names are unique per workspace, ignoring case. Rank is an integer from 1 (default 10); lower is higher priority.",
      tags: ["Place Categories"],
    })
    .input(createPlaceCategoryPublicRequest)
    .output(placeCategoryWriteResource)
    .errors(possibleErrorsOnCreatingPlaceCategory)
    .handler(
      async ({ context, input }) =>
        await placeCategoryService.create({
          workspaceId: context.workspace.id,
          ...input,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/place-categories/{id}",
      summary: "Update place category",
      description:
        "Changes the fields sent and leaves the rest; send at least one. Use `placeCategories.list` to find the id first.",
      tags: ["Place Categories"],
    })
    .input(updatePlaceCategoryPublicRequest)
    .output(placeCategoryWriteResource)
    .errors(possibleErrorsOnMutatingPlaceCategory)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await placeCategoryService.update({
        workspaceId: context.workspace.id,
        categoryId: id,
        data,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/place-categories/{id}",
      summary: "Delete place category",
      description:
        "Deletes the category. Its locations are kept and left uncategorized; the response says how many. Use `placeCategories.list` to find the id first.",
      tags: ["Place Categories"],
    })
    .input(placeCategoryIdPublicRequest)
    .output(deletePlaceCategoryPublicResponse)
    .errors(possibleErrorsOnDeletingResource)
    .handler(
      async ({ context, input }) =>
        await placeCategoryService.delete({
          workspaceId: context.workspace.id,
          categoryId: input.id,
        }),
    ),
}

export const placeLocationsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/place-locations",
      summary: "List place locations",
      description:
        "Business locations customers can find near them. `previewUrl` is the Google Maps link the UI's Preview button opens. Get `categoryId` values from `placeCategories.list`.",
      tags: ["Place Locations"],
    })
    .input(listPlaceLocationsPublicRequest)
    .output(listPlaceLocationsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await placeLocationService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/place-locations/{id}",
      summary: "Get place location",
      description:
        "Use `placeLocations.list` to find the id first. `previewUrl` is the Google Maps link the UI's Preview button opens.",
      tags: ["Place Locations"],
    })
    .input(placeLocationIdPublicRequest)
    .output(placeLocationResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await placeLocationService.find({
          workspaceId: context.workspace.id,
          locationId: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/place-locations",
      summary: "Create place location",
      description:
        "Latitude and longitude are JSON numbers (not strings). `categoryId` is optional; get it from `placeCategories.list`. Duplicate names and coordinates are allowed.",
      tags: ["Place Locations"],
    })
    .input(createPlaceLocationPublicRequest)
    .output(placeLocationResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await placeLocationService.create({
          workspaceId: context.workspace.id,
          ...input,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/place-locations/{id}",
      summary: "Update place location",
      description:
        "Changes the fields sent and leaves the rest; send at least one. Use `placeLocations.list` to find the id and `placeCategories.list` for `categoryId` (null clears it).",
      tags: ["Place Locations"],
    })
    .input(updatePlaceLocationPublicRequest)
    .output(placeLocationResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await placeLocationService.update({
        workspaceId: context.workspace.id,
        locationId: id,
        data,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/place-locations/{id}",
      summary: "Delete place location",
      description:
        "Deletes the location only; its category is kept. Get the id from `placeLocations.list`.",
      successStatus: 204,
      tags: ["Place Locations"],
    })
    .input(placeLocationIdPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await placeLocationService.delete({
        workspaceId: context.workspace.id,
        locationId: input.id,
      })
    }),
}
