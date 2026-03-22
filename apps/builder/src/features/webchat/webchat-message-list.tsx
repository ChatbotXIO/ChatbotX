"use client"

import { Skeleton } from "@aha.chat/ui/components/ui/skeleton"
import { useEffect, useRef, useState } from "react"
import {
  type GridComponents,
  Virtuoso,
  type VirtuosoHandle,
} from "react-virtuoso"
import { MessageBubble } from "../messages/components/message-bubble"
import { MessageItem } from "../messages/components/message-item"
import type { MessageResource } from "../messages/schemas"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"

const MESSAGE_LIST_PER_PAGE = 50

const TYPING_INDICATOR_ID = "__typing-indicator__" as const

export function WebchatMessageList() {
  const {
    messages,
    loadMoreMessages,
    nextCursorMessage,
    isLoadMoreMessage,
    initGuestSession,
    guestConversationId,
    sendPostback,
    isTyping,
  } = useGuestSessionStore((state) => state)

  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // Include typing indicator as last item so scrollToIndex("LAST") works
  const data = isTyping ? [...messages, { id: TYPING_INDICATOR_ID }] : messages

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
    <div className="relative flex flex-1 flex-col py-4">
      <Virtuoso
        alignToBottom={true}
        components={{
          List: MessageComponentList,
          Header: MessageComponentHeader,
        }}
        data={data}
        followOutput={true}
        initialTopMostItemIndex={Math.max(0, data.length - 1)}
        itemContent={(_, item) =>
          item.id === TYPING_INDICATOR_ID ? (
            <TypingIndicator />
          ) : (
            <MessageItem
              guestDisplay={true}
              key={item.id}
              message={item as MessageResource}
              onPostback={sendPostback}
            />
          )
        }
        rangeChanged={({ startIndex }) => {
          if (startIndex <= 5 && page !== 1) {
            loadMoreItems()
          }
        }}
        ref={virtuosoRef}
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

const TypingIndicator = () => (
  <MessageBubble variant="left">
    <div className="mx-3 flex min-h-11 items-center gap-1 rounded-xl bg-secondary px-4 py-3">
      <span
        aria-hidden
        className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]"
      />
      <span
        aria-hidden
        className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]"
      />
      <span
        aria-hidden
        className="size-2 animate-bounce rounded-full bg-muted-foreground"
      />
    </div>
  </MessageBubble>
)

const MessageComponentList: GridComponents["List"] = ({
  children,
  ...props
}) => (
  <div {...props} className="virtuoso-item-list flex flex-col gap-1.5">
    {children}
  </div>
)
