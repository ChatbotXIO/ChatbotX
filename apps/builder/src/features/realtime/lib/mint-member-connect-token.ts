import { resolveBroadcastSecret } from "@chatbotx.io/business"
import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import { signMemberConnectToken } from "@chatbotx.io/realtime-protocol/auth"
import { resolveMemberChatScope } from "./member-chat-scope"

/**
 * Mints the short-lived (60s) realtime connect token bound to
 * { userId, workspaceId } with the member's chat scope. `issuedAtMs` must be
 * read before the membership lookup so a permission change racing the mint is
 * detected by the gateway (it closes sockets minted before the change).
 */
export const mintMemberConnectToken = async (input: {
  workspaceId: string
  userId: string
  permissions: WorkspaceMemberPermissions
  issuedAtMs: number
}): Promise<string> => {
  const { chatScope, teamIds } = await resolveMemberChatScope(input)
  return await signMemberConnectToken(
    {
      workspaceId: input.workspaceId,
      userId: input.userId,
      chatScope,
      teamIds,
      issuedAtMs: input.issuedAtMs,
    },
    resolveBroadcastSecret(),
  )
}
