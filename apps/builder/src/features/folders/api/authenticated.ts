import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { listFolders } from "../queries"
import { listFoldersRequest, listFoldersResponse } from "../schema/resource"

export const foldersAuthenticatedAPI = {
  listFoldersAuthenticatedAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/folders",
      summary: "List folders",
      tags: ["Folders"],
    })
    .input(listFoldersRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listFoldersResponse)
    .handler(async ({ input }) => {
      return await listFolders({
        ...input,
        folderId: input.folderId ?? null,
      })
    }),
}
