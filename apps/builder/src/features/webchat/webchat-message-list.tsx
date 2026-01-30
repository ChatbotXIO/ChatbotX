"use client"

import { Skeleton } from "@aha.chat/ui/components/ui/skeleton"
import { useEffect, useState } from "react"
import { type GridComponents, Virtuoso } from "react-virtuoso"
import { MessageItem } from "../messages/components/message-item"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"

const MESSAGE_LIST_PER_PAGE = 50

export function WebchatMessageList() {
  const {
    messages,
    loadMoreMessages,
    nextCursorMessage,
    isLoadMoreMessage,
    initGuestSession,
    guestConversationId,
    sendPostback,
  } = useGuestSessionStore((state) => state)

  // Check if there are more pages to load
  const hasNextPage = messages.length === 0 || nextCursorMessage !== null

  const [page, setPage] = useState(1)

  useEffect(() => {
    initGuestSession()
    setPage(1)

    if (guestConversationId) {
      loadMoreMessages(guestConversationId, MESSAGE_LIST_PER_PAGE)
    }
  }, [loadMoreMessages, initGuestSession, guestConversationId])

  // Load more items when reaching the end of the list
  const loadMoreItems = () => {
    if (!isLoadMoreMessage && hasNextPage) {
      setPage((prev) => prev + 1)
    }
  }

  return (
    <div className="flex flex-1 flex-col py-4">
      <Virtuoso
        components={{
          List: MessageComponentList,
          Header: MessageComponentHeader,
        }}
        data={messages}
        followOutput
        initialTopMostItemIndex={messages.length - 1}
        itemContent={(_, message) => (
          <MessageItem
            guestDisplay={true}
            key={message.id}
            message={message}
            onPostback={sendPostback}
          />
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
  const { isLoadMoreMessage } = useGuestSessionStore((state) => state)

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
  <div {...props} className="virtuoso-item-list flex flex-col gap-1.5">
    {children}
  </div>
)
