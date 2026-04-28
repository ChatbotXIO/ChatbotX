"use client"

import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useEffect, useRef, useState } from "react"
import { type GridComponents, Virtuoso } from "react-virtuoso"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../chat/store/chat-store-provider"
import { MessageItem } from "./components/message-item"

const MESSAGE_LIST_PER_PAGE = 20
const START_INDEX = 100_000

export function MessageList() {
  const workspaceId = useWorkspaceId()

  const {
    messages,
    loadMoreMessages,
    isLoadMoreMessage,
    hasNextMessagePage,
    activeConversationId,
  } = useChatStore((state) => state)

  const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX)
  const prevLengthRef = useRef(0)
  const prependPendingRef = useRef(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  useEffect(() => {
    setFirstItemIndex(START_INDEX)
    prevLengthRef.current = 0
    prependPendingRef.current = false
    if (activeConversationId) {
      loadMoreMessages(workspaceId, MESSAGE_LIST_PER_PAGE)
    }
  }, [activeConversationId])

  useEffect(() => {
    const prevLength = prevLengthRef.current
    const delta = messages.length - prevLength
    if (delta > 0 && prependPendingRef.current) {
      setFirstItemIndex((idx) => idx - delta)
      prependPendingRef.current = false
    }
    prevLengthRef.current = messages.length
  }, [messages.length])

  const loadMoreItems = () => {
    if (isLoadMoreMessage || !hasNextMessagePage || messages.length === 0) {
      return
    }
    prependPendingRef.current = true
    loadMoreMessages(workspaceId, MESSAGE_LIST_PER_PAGE)
  }

  return (
    <div className="flex flex-1 flex-col">
      <Virtuoso
        alignToBottom={true}
        components={{
          List: MessageComponentList,
          Header: MessageComponentHeader,
        }}
        data={messages}
        firstItemIndex={firstItemIndex}
        followOutput
        initialTopMostItemIndex={{ index: "LAST" }}
        itemContent={(_, message) => (
          <MessageItem key={message.id} message={message} />
        )}
        startReached={loadMoreItems}
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
