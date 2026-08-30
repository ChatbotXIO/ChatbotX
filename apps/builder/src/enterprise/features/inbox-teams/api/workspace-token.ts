import { inboxTeamContract } from "@chatbotx.io/api-contract/enterprise/inbox-team"
import { implement, onError } from "@orpc/server"
import type { BaseContext } from "@/middlewares/context"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import { mapKnownOrpcErrors, requireTokenScope } from "@/orpc"
import { listInboxTeams } from "../queries"

const os = implement(inboxTeamContract)
  .$context<BaseContext>()
  .use(onError(mapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)
  .use(requireTokenScope("inbox"))

export const inboxTeamsWorkspaceTokenAPIs = {
  listTeamsWorkspaceTokenAPI: os.listTeamsContract.handler(
    async ({ context }) =>
      await listInboxTeams({ workspaceId: context.workspace.id }),
  ),
}

export default inboxTeamsWorkspaceTokenAPIs
