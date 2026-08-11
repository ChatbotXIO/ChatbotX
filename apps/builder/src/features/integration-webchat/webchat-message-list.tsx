"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { BotIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import {
  type GridComponents,
  Virtuoso,
  type VirtuosoHandle,
} from "react-virtuoso"
import { MessageBubble } from "../messages/components/message-bubble"
import { MessageItem } from "../messages/components/message-item"
import type { MessageResourceWithRelations } from "../messages/schema/resource"
import { useGuestSessionStore } from "./providers/store/guest-session-provider"

const MESSAGE_LIST_PER_PAGE = 50

const TYPING_INDICATOR_ID = "__typing-indicator__" as const

export function WebchatMessageList() {
  const {
    messages,
    loadMoreMessages,
    nextCursorMessage,
    isLoadMoreMessage,
    guestConversationId,
    sendPostback,
    isTyping,
    workspaceLogoUrl,
  } = useGuestSessionStore((state) => state)

  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // Include typing indicator as last item so scrollToIndex("LAST") works
  const data = isTyping ? [...messages, { id: TYPING_INDICATOR_ID }] : messages

  // Check if there are more pages to load
  const hasNextPage = messages.length === 0 || nextCursorMessage !== null

  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)

    if (guestConversationId) {
      loadMoreMessages(guestConversationId, MESSAGE_LIST_PER_PAGE)
    }
  }, [loadMoreMessages, guestConversationId])

  // Load more items when reaching the end of the list
  const loadMoreItems = () => {
    if (!isLoadMoreMessage && hasNextPage) {
      setPage((prev) => prev + 1)
    }
  }

  return (
    <div className="relative flex flex-1 flex-col px-3 py-3">
      <Virtuoso
        alignToBottom={true}
        components={{
          List: MessageComponentList,
          Header: MessageComponentHeader,
        }}
        data={data}
        followOutput
        initialTopMostItemIndex={{ index: "LAST" }}
        itemContent={(_, item) =>
          item.id === TYPING_INDICATOR_ID ? (
            <TypingIndicator avatarUrl={workspaceLogoUrl} />
          ) : (
            <MessageItem
              avatarUrl={workspaceLogoUrl}
              guestDisplay={true}
              key={item.id}
              message={item as MessageResourceWithRelations}
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

const TypingIndicator = ({ avatarUrl }: { avatarUrl?: string }) => (
  <MessageBubble variant="left">
    {avatarUrl && (
      <Avatar className="mt-auto size-6 self-start">
        <AvatarImage alt="" src={avatarUrl} />
        <AvatarFallback>
          <BotIcon aria-hidden className="size-3.5" />
        </AvatarFallback>
      </Avatar>
    )}
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
