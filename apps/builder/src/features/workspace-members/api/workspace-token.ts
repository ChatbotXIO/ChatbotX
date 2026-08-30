import { workspaceMemberContract } from "@chatbotx.io/api-contract/workspace-member"
import { notFoundException } from "@chatbotx.io/business/errors"
import { implement, onError } from "@orpc/server"
import type { BaseContext } from "@/middlewares/context"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import { mapKnownOrpcErrors, requireTokenScope } from "@/orpc"
import { getWorkspaceMember, listWorkspaceMembers } from "../queries"

const os = implement(workspaceMemberContract)
  .$context<BaseContext>()
  .use(onError(mapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)
  .use(requireTokenScope("inbox"))

export const workspaceMembersAPIs = {
  listMembersWorkspaceTokenAPI: os.listWorkspaceMembersContract.handler(
    async ({ context, input }) =>
      await listWorkspaceMembers({
        ...input,
        workspaceId: context.workspace.id,
      }),
  ),
  getMemberWorkspaceTokenAPI: os.getWorkspaceMemberContract.handler(
    async ({ context, input }) => {
      const member = await getWorkspaceMember({
        ...input,
        workspaceId: context.workspace.id,
      })
      if (!member) {
        throw notFoundException("Member not found")
      }
      return member
    },
  ),
}

export default workspaceMembersAPIs
