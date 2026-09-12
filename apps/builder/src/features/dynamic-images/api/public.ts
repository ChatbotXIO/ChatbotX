import { dynamicImageService } from "@chatbotx.io/business/dynamic-image"
import type { DynamicImageModel } from "@chatbotx.io/database/types"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { getBrokerOrigin } from "@/lib/oauth-broker"
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

const tags = ["Dynamic Images"]

// Resolves each row's `backgroundUrl` storage key into a public URL (in one
// batched settings lookup) and stamps the `{{user_id}}` trigger URL every
// route on this router publishes. Same template the edit page shows the
// user (`app/space/[workspaceId]/dynamic-images/[id]/edit/page.tsx`) and
// that `extractDynamicImageId` accepts, so the API and the UI can't drift.
const toPublicResources = async (
  workspaceId: string,
  rows: DynamicImageModel[],
) => {
  const resolved = await dynamicImageService.resolveBackgroundUrls({
    workspaceId,
    rows,
  })
  return resolved.map(({ workspaceId: _workspaceId, ...row }) => ({
    ...row,
    imageUrl: `${getBrokerOrigin()}/dynamic-images?dynamicImageId=${row.id}&userId={{user_id}}`,
  }))
}

export const dynamicImagesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/dynamic-images",
      summary: "List dynamic images",
      tags,
    })
    .input(listDynamicImagesPublicRequest)
    .output(listDynamicImagesPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { data, pageCount } = await dynamicImageService.list({
        workspaceId: context.workspace.id,
        page: input.page,
        perPage: input.perPage,
        name: input.name,
      })
      return {
        data: await toPublicResources(context.workspace.id, data),
        pageCount,
      }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/dynamic-images/{id}",
      summary: "Get a dynamic image",
      tags,
    })
    .input(z.object({ id: zodBigintAsString() }))
    .output(publicDynamicImageResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const row = await dynamicImageService.find({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      return (await toPublicResources(context.workspace.id, [row]))[0]
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/dynamic-images",
      summary: "Create a dynamic image",
      successStatus: 201,
      tags,
    })
    .input(createDynamicImagePublicRequest)
    .output(publicDynamicImageResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const row = await dynamicImageService.create({
        workspaceId: context.workspace.id,
        ...input,
      })
      return (await toPublicResources(context.workspace.id, [row]))[0]
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/dynamic-images/{id}",
      summary: "Update a dynamic image",
      tags,
    })
    .input(updateDynamicImagePublicRequest)
    .output(publicDynamicImageResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      const row = await dynamicImageService.update({
        workspaceId: context.workspace.id,
        id,
        ...data,
      })
      return (await toPublicResources(context.workspace.id, [row]))[0]
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/dynamic-images/{id}",
      summary: "Delete a dynamic image",
      successStatus: 204,
      tags,
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
      tags,
    })
    .input(setDynamicImageEnabledPublicRequest)
    .output(publicDynamicImageResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const row = await dynamicImageService.setEnabled(
        { workspaceId: context.workspace.id, id: input.id },
        input.enabled,
      )
      return (await toPublicResources(context.workspace.id, [row]))[0]
    }),
}
