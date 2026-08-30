import { reflinkContract } from "@chatbotx.io/api-contract/reflink"
import { notFoundException } from "@chatbotx.io/business/errors"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"
import { findReflink } from "../queries"

const os = implement(reflinkContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

export const refLinksWorkspaceTokenAPIs = {
  getRefLinkWorkspaceTokenAPI: os.getRefLinkContract.handler(
    async ({ context, input }) => {
      const reflink = await findReflink({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      if (!reflink) {
        throw notFoundException("Ref link not found")
      }
      return reflink
    },
  ),
}

export default refLinksWorkspaceTokenAPIs
