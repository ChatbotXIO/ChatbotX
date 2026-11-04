import { workspaceMemberService } from "@chatbotx.io/business"

/**
 * The workspaces `userId` is a member of. Shared by the session `/rpc`
 * procedure and the mobile `GET /v1/me/workspaces`, so the two never disagree.
 */
export const listMyWorkspaces = async (userId: string) => {
  const members = await workspaceMemberService.listByUserId({ userId })
  return { workspaces: members.map((member) => member.workspace) }
}
