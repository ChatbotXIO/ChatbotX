import { workspaceTokenAuthAPI } from "@/orpc"
import { listErrorLogs } from "../queries"
import {
  listErrorLogsRequest,
  publicListErrorLogsResponse,
} from "../schemas/query"

export const errorLogsWorkspaceTokenAPIs = {
  listErrorLogsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/error-logs",
      summary: "List error logs",
      tags: ["Error Logs"],
    })
    .input(listErrorLogsRequest)
    .output(publicListErrorLogsResponse)
    .handler(async ({ context, input }) => {
      return await listErrorLogs({
        ...input,
        workspaceId: context.workspace.id,
      })
    }),
}

export default errorLogsWorkspaceTokenAPIs
