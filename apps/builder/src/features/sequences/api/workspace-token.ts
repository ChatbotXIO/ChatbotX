import { sequenceContract } from "@chatbotx.io/api-contract/sequence"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"
import { getSequence, listSequences } from "../queries"

const os = implement(sequenceContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

export const sequencesWorkspaceTokenAPIs = {
  listSequencesWorkspaceTokenAPI: os.listSequencesContract.handler(
    async ({ context, input }) =>
      await listSequences({
        ...input,
        workspaceId: context.workspace.id,
      }),
  ),

  getSequenceWorkspaceTokenAPI: os.getSequenceContract.handler(
    async ({ context, input }) =>
      await getSequence(context.workspace.id, input.id),
  ),
}
