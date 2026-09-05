import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listFlows } from "../queries"
import { flowResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const flowsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/flows",
      summary: "Get all flows",
      tags: ["Flows"],
    })
    .input(publicListRequest)
    .output(publicListResponse(flowResource.pick({ id: true, name: true })))
    .handler(
      async ({ context, input }) =>
        await listFlows({
          ...input,
          workspaceId: context.workspace.id,
          active: true,
        }),
    ),
}
