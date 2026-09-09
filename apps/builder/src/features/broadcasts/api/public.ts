import { broadcastService } from "@chatbotx.io/business"
import z from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listBroadcastAudience, listBroadcasts } from "../queries"
import {
  listBroadcastAudienceResponse,
  publicListBroadcastsResponse,
} from "../schema/query"
import { publicBroadcastResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("broadcasts")

export const broadcastsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts",
      summary: "Get all broadcasts",
      tags: ["Broadcasts"],
    })
    .input(publicListRequest)
    .output(publicListBroadcastsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await listBroadcasts({
          workspaceId: context.workspace.id,
          ...input,
          sort: [{ id: "createdAt", desc: true }],
          name: null,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts/{idOrName}",
      summary: "Get broadcast by id or name",
      tags: ["Broadcasts"],
    })
    .input(z.object({ idOrName: z.string() }))
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await broadcastService.findByIdOrName({
          workspaceId: context.workspace.id,
          idOrName: input.idOrName,
        }),
    ),

  getAudience: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts/{idOrName}/audience",
      summary: "Get broadcast audience",
      tags: ["Broadcasts"],
    })
    .input(
      z.object({
        idOrName: z.string(),
        page: z.coerce.number().int().min(1).optional(),
        perPage: z.coerce.number().int().min(1).optional(),
      }),
    )
    .output(listBroadcastAudienceResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await listBroadcastAudience({
          idOrName: input.idOrName,
          workspaceId: context.workspace.id,
          page: input.page,
          perPage: input.perPage,
        }),
    ),
}
