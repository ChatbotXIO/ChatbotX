import { paginateInMemory, publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listInboxTeams } from "../queries"
import { publicListInboxTeamsResponse } from "../schema/action"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("inbox")

export const inboxTeamsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/teams",
      summary: "List teams",
      tags: ["Teams"],
    })
    .input(publicListRequest)
    .output(publicListInboxTeamsResponse)
    .handler(async ({ context, input }) => {
      const { data } = await listInboxTeams({
        workspaceId: context.workspace.id,
      })
      return paginateInMemory(data, input)
    }),
}
