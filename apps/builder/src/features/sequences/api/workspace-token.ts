import { sequenceContract } from "@chatbotx.io/api-contract/sequence"
import { implement, onError } from "@orpc/server"
import type { BaseContext } from "@/middlewares/context"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import { mapKnownOrpcErrors, requireTokenScope } from "@/orpc"
import { getSequence, listSequences } from "../queries"

const os = implement(sequenceContract)
  .$context<BaseContext>()
  .use(onError(mapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)
  .use(requireTokenScope("broadcasts"))

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
