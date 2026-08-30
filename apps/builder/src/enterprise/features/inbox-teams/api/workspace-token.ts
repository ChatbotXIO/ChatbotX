import { inboxTeamContract } from "@chatbotx.io/api-contract/enterprise/inbox-team"
import { implement, onError } from "@orpc/server"
import { workspaceTokenAuthMidddleware } from "@/middlewares/workspace-token-auth"
import type { BaseContext } from "@/orpc"
import { logAndMapKnownOrpcErrors } from "@/orpc"
import { listInboxTeams } from "../queries"

const os = implement(inboxTeamContract)
  .$context<BaseContext>()
  .use(onError(logAndMapKnownOrpcErrors))
  .use(workspaceTokenAuthMidddleware)

export const inboxTeamsWorkspaceTokenAPIs = {
  listTeamsWorkspaceTokenAPI: os.listTeamsContract.handler(
    async ({ context }) =>
      await listInboxTeams({ workspaceId: context.workspace.id }),
  ),
}

export default inboxTeamsWorkspaceTokenAPIs
