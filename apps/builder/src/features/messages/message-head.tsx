"use client"

import { useChatStore } from "../chat/store/chat-store-provider"
import { getFullName } from "../contacts/utils"

export default function MessageHead() {
  const { conversations, activeConversationId } = useChatStore((state) => state)

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  )

  return (
    <div className="pb-3">
      <div className="flex items-center gap-2 border-b px-3 pb-3">
        <div className="flex-1">
          <div className="truncate font-medium text-semibold">
            {getFullName(activeConversation?.contact)}
          </div>
        </div>
      </div>
    </div>
  )
}
