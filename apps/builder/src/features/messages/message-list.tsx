"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Virtuoso } from "react-virtuoso"
import { useChatStore } from "../chat/store/chat-store-provider"
import { MessageItem } from "./components/message-item"

const MESSAGE_LIST_PER_PAGE = 50

export function MessageList() {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const {
    messages,
    loadMoreMessages,
    nextCursorMessage,
    isLoadMoreMessage,
    activeConversationId,
  } = useChatStore((state) => state)

  // Check if there are more pages to load
  const hasNextPage = messages.length === 0 || nextCursorMessage !== null

  const [page, setPage] = useState(1)
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    if (activeConversationId) {
      loadMoreMessages(chatbotId, MESSAGE_LIST_PER_PAGE)
    }
  }, [page, activeConversationId])

  // Load more items when reaching the end of the list
  const loadMoreItems = () => {
    if (!isLoadMoreMessage && hasNextPage) {
      setPage((prev) => prev + 1)
    }
  }

  return (
    <div className="flex flex-col flex-1">
      <Virtuoso
        data={messages}
        followOutput
        initialTopMostItemIndex={messages.length - 1}
        rangeChanged={({ startIndex }) => {
          if (startIndex <= 5 && messages.length >= MESSAGE_LIST_PER_PAGE) {
            loadMoreItems()
          }
        }}
        itemContent={(_, message) => (
          <MessageItem message={message} key={message.id} />
        )}
        components={{
          List: ({ children, ...props }) => (
            <div
              {...props}
              className="virtuoso-item-list flex flex-col gap-1.5"
            >
              {children}
            </div>
          ),
          Header: () =>
            isLoadMoreMessage ? (
              <div className="flex items-center space-x-2 px-3 py-2">
                <Skeleton className="h-8 w-3/5 rounded-xl" />
              </div>
            ) : null,
        }}
      />
    </div>
  )
}
