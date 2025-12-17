"use client"

import { useChatStore } from "../chat/store/chat-store-provider"
import { getFullName } from "../contacts/utils"
import { ConversationAction } from "../conversations/conversation-action"
import { UpdateConversationAssigner } from "../conversations/update-conversation-assigner"

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
          <UpdateConversationAssigner
            conversation={activeConversation}
            onChange={setAssignee}
          />
        </div>
        <ConversationAction conversation={activeConversation} />
      </div>
    )
  )
}
