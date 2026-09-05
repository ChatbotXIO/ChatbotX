import z from "zod"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

import {
  listBroadcastAudience,
  listBroadcasts,
  publicGetBroadcast,
} from "../queries"
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
    .output(publicListBroadcastsResponse)
    .handler(async ({ context }) => {
      const { data } = await listBroadcasts({
        workspaceId: context.workspace.id,
        page: 1,
        perPage: 100,
        sort: [{ id: "createdAt", desc: true }],
        name: null,
      })

      return { data }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts/{idOrName}",
      summary: "Get broadcast by id or name",
      tags: ["Broadcasts"],
    })
    .input(z.object({ idOrName: z.string() }))
    .output(publicBroadcastResource)
    .handler(
      async ({ context, input }) =>
        await publicGetBroadcast(context.workspace.id, input.idOrName),
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
    .handler(async ({ context, input }) => {
      const broadcast = await publicGetBroadcast(
        context.workspace.id,
        input.idOrName,
      )
      return await listBroadcastAudience({
        broadcastId: broadcast.id,
        workspaceId: context.workspace.id,
        page: input.page,
        perPage: input.perPage,
      })
    }),
}
