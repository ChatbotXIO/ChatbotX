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
      summary: "Listar logs de erro",
      tags: ["Logs de Erro"],
    })
    .input(listErrorLogsRequest.omit({ workspaceId: true }))
    .output(publicListErrorLogsResponse)
    .handler(
      async ({ context, input }) =>
        await listErrorLogs({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),
}

export default errorLogsWorkspaceTokenAPIs
