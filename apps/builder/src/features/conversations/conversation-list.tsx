"use client"

import { Button } from "@/components/ui/button"
import ConversationItem from "@/features/conversations/conversation-item"
import ConversationLoading from "@/features/inbox/conversation-loading"
import { parseAsString, useQueryState } from "nuqs"
import { Suspense, use, useEffect, useRef, useState } from "react"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"
import { getConversations, getCurrentConversation } from "@/features/conversations/queries";
import { Message } from "@ahachat.ai/database"
import { ConversationResource, CursorConversations } from "@/features/conversations/schemas/get-conversations-schema";
import { generateRandomMessage } from "@/mock/messages.mock";

interface ConversationListProps {
  chatbotId: string
  promises: Promise<Awaited<ReturnType<typeof getConversations>>>
}

export default function ConversationList({ chatbotId, promises }: ConversationListProps) {
  const { data, cursor: initCursor } = use(promises)
  const [conversations, setConversations] = useState(data)
  const [cursor, setCursor] = useState<CursorConversations | null>(initCursor)
  const [loadingMore, setLoadingMore] = useState<boolean>(false)

  const [activeConversationId, setActiveConversationId] = useQueryState("conversationId", parseAsString.withOptions({
    history: "replace",
    shallow: false,
  }))

  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const foundIndex = conversations.findIndex((c) => c.id == activeConversationId)
  const [activeConversationIndex] = useState<number>(foundIndex > -1 ? foundIndex : 0)

  const loadMoreConversations = async () => {
    if (loadingMore || !cursor) {
      return
    }

    try {
      setLoadingMore(true)
      const newConversations = await getConversations({
        chatbotId,
        cursor
      })
      setConversations((prev) => [...prev, ...newConversations.data])
      setCursor(newConversations.cursor)
    } catch (err) {
      console.log('err', err)
    } finally {
      setLoadingMore(false)
    }
  }

  const onNewConversation = () => {
  }

  const mockNewMessageEvent = async () => {
    const message = generateRandomMessage(chatbotId)
    const randomNewConversation = Math.random() < 0.5
    if (!randomNewConversation) {
      message.conversationId = conversations[Math.floor(Math.random() * conversations.length)]?.id as string
    }

    await onNewMessage(message)
  }

  const onNewMessage = async (message: Message) => {
    const index = conversations.findIndex((c) => c.id === message.conversationId)
    if (index > -1) {
      const [existingConversation] = conversations.splice(index, 1) as [ConversationResource];
      existingConversation.latestMessage = message
      existingConversation.updatedAt = message.createdAt
      existingConversation.unreadCount++
      conversations.unshift(existingConversation);
      setConversations([...conversations])
      return
    }

    const newConversation = await getCurrentConversation({
      chatbotId,
      id: message.conversationId
    })
    if (!newConversation.conversation) {
      return
    }
    setConversations([newConversation.conversation as ConversationResource, ...conversations])
  }

  useEffect(() => {
    virtuosoRef.current?.scrollToIndex({
      index: activeConversationIndex,
      align: "start",
      behavior: "smooth",
    })
  }, [activeConversationIndex])

  return (
    <>
      <div className="flex items-center gap-2 p-3">
        <Button onClick={onNewConversation}>Add</Button>
        <Button onClick={mockNewMessageEvent}>New Message</Button>
      </div>

      <Virtuoso
        data={conversations}
        ref={virtuosoRef}
        className="flex flex-col gap-2"
        initialItemCount={data.length}
        atBottomStateChange={(atBottom) => atBottom && loadMoreConversations()}
        itemContent={(_, item) => (
          <Suspense fallback={<ConversationLoading/>}>
            <ConversationItem conversation={item}
                              isActive={item.id === activeConversationId}
                              onSelect={() => setActiveConversationId(item.id)}/>
          </Suspense>
        )}
      />
    </>
  )
}
