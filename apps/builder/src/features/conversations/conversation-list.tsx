"use client"

import { Button } from "@/components/ui/button"
import ConversationItem from "@/features/conversations/conversation-item"
import ConversationLoading from "@/features/inbox/conversation-loading"
import { Conversation } from "@/features/inbox/interfaces/conversation"
import { generateRandomConversation } from "@/mock/conversation.mock"
import { useQueryState } from "nuqs"
import { Suspense, useEffect, useRef, useState } from "react"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"

interface ConversationListProps {
  conversations: Conversation[]
}

export default function ConversationList({ conversations: data }: ConversationListProps) {
  if (data[0]) {
    data[0].isActive = true
  }

  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [conversations, setConversations] = useState<Conversation[]>(data)

  const [activeConversationIndex, setActiveConversationIndex] = useState<number>(0)
  const [activeConversationId, setActiveConversationId] = useQueryState("conversation_id")
  if (activeConversationId) {
    const foundIndex = conversations.findIndex((c: Conversation) => c.id == activeConversationId)
    if (foundIndex) {
      setActiveConversationIndex(foundIndex)
    }
  }

  const onAdd = () => {
    const newConversation = generateRandomConversation()
    setConversations(() => [newConversation, ...conversations])
  }

  const onNewMessage = () => {
    const updateConversation = conversations.map((user: Conversation, idx: number) => {
      if (idx === 10) {
        user.lastMessage = "new Change message"
      }
      return user
    })
    // setIdSelected(10)
    setConversations(updateConversation)
  }

  useEffect(() => {
    virtuosoRef.current?.scrollToIndex({
      index: activeConversationIndex,
      align: "start",
      behavior: "smooth",
    })
  }, [conversations, activeConversationIndex])

  return (
    <>
      <div className="flex items-center gap-2 p-3">
        <Button onClick={onAdd}>Add</Button>
        <Button onClick={onNewMessage}>New Message</Button>
      </div>

      <Virtuoso
        data={conversations}
        ref={virtuosoRef}
        className="flex flex-col gap-2"
        itemContent={(index, item) => (
          <Suspense fallback={<ConversationLoading />}>
            <ConversationItem conversation={item} />
          </Suspense>
        )}
      />
    </>
  )
}
