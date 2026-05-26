import { z } from "zod"
import { workspaceTokenAuthAPI } from "@/orpc"
import { listSavedReplies } from "../queries"
import { listSavedReplyResponse } from "../schema/mutation"

export const savedReplyWorkspaceTokenAPIs = {
  listSavedRepliesWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/saved-replies",
      summary: "Listar respostas salvas",
      tags: ["Respostas Salvas"],
    })
    .input(z.object({}))
    .output(listSavedReplyResponse)
    .handler(
      async ({ context }) =>
        await listSavedReplies({ workspaceId: context.workspace.id }),
    ),
}

export default savedReplyWorkspaceTokenAPIs
