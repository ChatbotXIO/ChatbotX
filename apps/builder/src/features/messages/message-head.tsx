"use client"

import { useChatStore } from "../chat/store/chat-store-provider"
import { getFullName } from "../contacts/utils"
import { UpdateConversationAssignee } from "../conversations/components/update-conversation-assignee"
import { ConversationAction } from "../conversations/conversation-action"

export default function MessageHead() {
  const { conversations, activeConversationId, setAssignee } = useChatStore(
    (state) => state,
  )

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  )

  return (
    activeConversation && (
      <div className="flex items-center gap-2 border-b px-3 pb-3">
        <div className="flex flex-1 flex-col">
          <div className="truncate font-medium text-semibold">
            {getFullName(activeConversation?.contact)}
          </div>
          <UpdateConversationAssignee
            conversation={activeConversation}
            onChange={setAssignee}
          />
        </div>
        <ConversationAction conversation={activeConversation} />
      </div>
    )
  )
}
