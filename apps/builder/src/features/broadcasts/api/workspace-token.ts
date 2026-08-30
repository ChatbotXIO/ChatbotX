import { broadcastContract } from "@chatbotx.io/api-contract/broadcast"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"
import {
  listBroadcastAudience,
  listBroadcasts,
  publicGetBroadcast,
} from "../queries"

const os = implement(broadcastContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

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
