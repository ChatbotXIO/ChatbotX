'use client'

import React, {Suspense, lazy, useRef, useState, useEffect} from "react";
import { Button } from "@/components/ui/button";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { Conversation } from "@/features/inbox/interfaces/conversation";
import { generateRandomConversation } from "@/mock/conversation.mock";

import ConversationLoading from "@/features/inbox/conversation-loading";

const LazyConversationItem = lazy(() => import("@/features/inbox/conversation-item"))

interface ConversationListProps {
  conversations: Conversation[]
}

export default function ConversationList({ conversations }: ConversationListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [users, setUsers] = useState<Conversation[]>(conversations);
  const [idSelected, setIdSelected] = useState<number>(0);

  const onAdd = () => {
    const newConversation = generateRandomConversation()
    setUsers(() => [newConversation, ...users])
  }

  const onNewMessage = () => {
    const updateConversation = users.map((user: Conversation, idx: number) => {
      if (idx === 10) {
        user.lastMessage = 'new Change message'
      }
      return user
    })
    setIdSelected(10)
    setUsers(updateConversation)
  }

  useEffect(() => {
    virtuosoRef.current?.scrollToIndex({
      index: idSelected,
      align: 'start',
      behavior: 'smooth',
    })
  }, [users, idSelected])

  return (
    <>
      <div className="flex items-center gap-2 p-3">
        <Button onClick={onAdd}>Add</Button>
        <Button onClick={onNewMessage}>New Message</Button>
      </div>
      <Virtuoso
        data={users}
        ref={virtuosoRef}
        itemContent={(_, item) => (
          <div className="p-2">
            <Suspense fallback={<ConversationLoading/>}>
              <LazyConversationItem conversation={item}/>
            </Suspense>
          </div>
        )}
      />
    </>
  )
}
