import { dynamicImageService } from "@chatbotx.io/business/dynamic-image"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createDynamicImagePublicRequest,
  listDynamicImagesPublicRequest,
  listDynamicImagesPublicResponse,
  publicDynamicImageResource,
  setDynamicImageEnabledPublicRequest,
  updateDynamicImagePublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("media")

export const dynamicImagesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/dynamic-images",
      summary: "List dynamic images",
      tags: ["Dynamic Images"],
    })
    .input(listDynamicImagesPublicRequest)
    .output(listDynamicImagesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await dynamicImageService.list({
          workspaceId: context.workspace.id,
          page: input.page,
          perPage: input.perPage,
          name: input.name,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/dynamic-images/{id}",
      summary: "Get a dynamic image",
      tags: ["Dynamic Images"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(publicDynamicImageResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await dynamicImageService.find({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/dynamic-images",
      summary: "Create a dynamic image",
      tags: ["Dynamic Images"],
    })
    .input(createDynamicImagePublicRequest)
    .output(publicDynamicImageResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await dynamicImageService.create({
          workspaceId: context.workspace.id,
          ...input,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/dynamic-images/{id}",
      summary: "Update a dynamic image",
      tags: ["Dynamic Images"],
    })
    .input(updateDynamicImagePublicRequest)
    .output(publicDynamicImageResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      return await dynamicImageService.update({
        workspaceId: context.workspace.id,
        id,
        ...data,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/dynamic-images/{id}",
      summary: "Delete a dynamic image",
      successStatus: 204,
      tags: ["Dynamic Images"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await dynamicImageService.delete({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),

  setEnabled: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/dynamic-images/{id}/enabled",
      summary: "Set whether a dynamic image is enabled",
      tags: ["Dynamic Images"],
    })
    .input(setDynamicImageEnabledPublicRequest)
    .output(publicDynamicImageResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(
      async ({ context, input }) =>
        await dynamicImageService.setEnabled(
          { workspaceId: context.workspace.id, id: input.id },
          input.enabled,
        ),
    ),
}
