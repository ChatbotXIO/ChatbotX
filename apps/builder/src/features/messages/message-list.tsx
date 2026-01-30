"use client"

import { Skeleton } from "@aha.chat/ui/components/ui/skeleton"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { type GridComponents, Virtuoso } from "react-virtuoso"
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  useEffect(() => {
    setPage(1)
    if (activeConversationId) {
      loadMoreMessages(chatbotId, MESSAGE_LIST_PER_PAGE)
    }
  }, [activeConversationId])

  // Load more items when reaching the end of the list
  const loadMoreItems = () => {
    if (!isLoadMoreMessage && hasNextPage) {
      setPage((prev) => prev + 1)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <Virtuoso
        components={{
          List: MessageComponentList,
          Header: MessageComponentHeader,
        }}
        data={messages}
        followOutput
        initialTopMostItemIndex={messages.length - 1}
        itemContent={(_, message) => (
          <MessageItem key={message.id} message={message} />
        )}
        rangeChanged={({ startIndex }) => {
          if (startIndex <= 5 && page !== 1) {
            loadMoreItems()
          }
        }}
      />
    </div>
  )
}

const MessageComponentHeader: GridComponents["Header"] = () => {
  const { isLoadMoreMessage } = useChatStore((state) => state)

  return isLoadMoreMessage ? (
    <div className="flex items-center space-x-2 px-3 py-2">
      <Skeleton className="h-8 w-3/5 rounded-xl" />
    </div>
  ) : null
}

const MessageComponentList: GridComponents["List"] = ({
  children,
  ...props
}) => (
  <div
    {...props}
    className="virtuoso-item-list flex flex-col gap-1.5 [&>div:first-child]:mt-3"
  >
    {children}
  </div>
)
