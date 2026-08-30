import { broadcastContract } from "@chatbotx.io/api-contract/broadcast"
import { implement, onError } from "@orpc/server"
import type { BaseContext } from "@/middlewares/context"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import { mapKnownOrpcErrors, requireTokenScope } from "@/orpc"
import {
  listBroadcastAudience,
  listBroadcasts,
  publicGetBroadcast,
} from "../queries"

const os = implement(broadcastContract)
  .$context<BaseContext>()
  .use(onError(mapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)
  .use(requireTokenScope("broadcasts"))

export const broadcastWorkspaceTokenAPIs = {
  listBroadcastsWorkspaceTokenAPI: os.listBroadcastsContract.handler(
    async ({ context }) => {
      const { data } = await listBroadcasts({
        workspaceId: context.workspace.id,
        page: 1,
        perPage: 100,
        sort: [{ id: "createdAt", desc: true }],
        name: null,
      })

      return { data }
    },
  ),

  getBroadcastWorkspaceTokenAPI: os.getBroadcastContract.handler(
    async ({ context, input }) =>
      await publicGetBroadcast(context.workspace.id, input.idOrName),
  ),

  getBroadcastAudienceWorkspaceTokenAPI:
    os.getBroadcastAudienceContract.handler(async ({ context, input }) => {
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
