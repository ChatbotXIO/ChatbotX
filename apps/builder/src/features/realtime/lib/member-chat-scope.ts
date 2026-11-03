import {
  type ConversationMemberScope,
  conversationMemberScope,
} from "@chatbotx.io/business"

export type MemberChatScope = Omit<ConversationMemberScope, "userId">

export const resolveMemberChatScope = async (input: {
  workspaceId: string
  userId: string
  permissions: Parameters<
    typeof conversationMemberScope.resolve
  >[0]["permissions"]
}): Promise<MemberChatScope> => {
  const { userId: _userId, ...scope } =
    await conversationMemberScope.resolve(input)
  return scope
}
