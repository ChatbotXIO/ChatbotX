"use client"

import { useChatStore } from "../chat/store/chat-store-provider"
import { AssignInboxMember } from "../chatbot-members/assign-inbox-member"
import type { ChatbotMemberResource } from "../chatbot-members/schemas/resource"
import { getFullName } from "../contacts/utils"

export default function MessageHead(props: {
  agents: ChatbotMemberResource[]
}) {
  const { conversations, activeConversationId } = useChatStore((state) => state)

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  )

  return (
    <div className="pb-3">
      <div className="flex items-center gap-2 border-b px-3 pb-3">
        <div className="flex flex-1 flex-col">
          <div className="truncate font-medium text-semibold">
            {getFullName(activeConversation?.contact)}
          </div>
          <AssignInboxMember agents={props.agents} />
        </div>
      </div>
    </div>
  )
}
