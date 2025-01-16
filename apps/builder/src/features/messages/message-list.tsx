"use client"

import { Button } from "@/components/ui/button"
import {
  ChatBubble,
  ChatBubbleAction,
  ChatBubbleActionWrapper,
  ChatBubbleAvatar,
  ChatBubbleMessage,
} from "@/components/ui/chat/chat-bubble"
import { ChatInput } from "@/components/ui/chat/chat-input"
import ConversationLoading from "@/features/inbox/conversation-loading"
import { getMessages } from "@/features/messages/queries"
import type {
  CursorMessages,
  MessageResource,
} from "@/features/messages/schemas/get-messages-schema"
import { cn } from "@/lib/utils"
import { MessageType, SenderType } from "@ahachat.ai/database"
import {
  File,
  Heart,
  PaperclipIcon,
  PlusCircle,
  Reply,
  SendIcon,
} from "lucide-react"
import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { Virtuoso } from "react-virtuoso"
import MessageItem from "./message-item"

interface MessagesProps {
  chatbotId: string
  conversationId: string
}

const actionIcons = [
  {
    icon: Heart,
    type: "emoticons",
  },
  {
    icon: Reply,
    type: "replay",
  },
]

export default function MessageList({
  chatbotId,
  conversationId,
}: MessagesProps) {
  const [messages, setMessages] = useState<MessageResource[]>([])
  // console.log('messages', messages)
  const loadingMore = useRef<boolean>(false)
  const cursor = useRef<CursorMessages | null>(null)
  const loadMoreMessages = useCallback(
    async (isLoadFirst = false) => {
      if (loadingMore.current || (!isLoadFirst && !cursor.current)) {
        return
      }

      try {
        loadingMore.current = true
        const newMessages = await getMessages({
          chatbotId,
          conversationId,
          cursor: cursor.current,
        })
        setMessages((prev) => [...newMessages.data.reverse(), ...prev])
        cursor.current = newMessages.cursor
      } catch (err) {
        console.log("err", err)
      } finally {
        loadingMore.current = false
      }
    },
    [chatbotId, conversationId],
  )

  useEffect(() => {
    cursor.current = null
    setMessages([])
    loadMoreMessages(true)
  }, [loadMoreMessages])

  const getPositionClasses = (senderType: SenderType): string => {
    if (senderType === SenderType.Contact) {
      return "justify-end"
    }

    if (senderType === SenderType.System) {
      return "justify-center"
    }

    return ""
  }

  const getMessageDirection = (
    senderType: SenderType,
  ): "sent" | "received" | null | undefined => {
    if (senderType === SenderType.Contact) {
      return "sent"
    }

    if (senderType === SenderType.System) {
      return null
    }

    return "received"
  }

  return (
    <>
      <div className="h-full flex flex-col p-2">
        <Virtuoso
          className="flex-1"
          data={messages}
          atTopStateChange={(atTop) => atTop && loadMoreMessages()}
          initialTopMostItemIndex={messages.length - 1}
          itemContent={(_, item) => (
            <Suspense fallback={<ConversationLoading />}>
              {!item && <div className="hidden" />}
              {item && (
                <div
                  className={cn(
                    "flex mb-1 max-h-[60%]",
                    getPositionClasses(item.senderType),
                  )}
                >
                  <ChatBubble
                    variant={getMessageDirection(item.senderType)}
                    key={item.id}
                    className="items-center"
                  >
                    <ChatBubbleAvatar
                      fallback={item.user?.name ?? ""}
                      src={item.user?.image ?? ""}
                    />
                    <ChatBubbleMessage
                      variant={getMessageDirection(item.senderType)}
                      className={cn(
                        item.messageType === MessageType.Text ||
                          item.messageType === MessageType.File
                          ? "rounded-md"
                          : "p-0 bg-transparent",
                      )}
                    >
                      <MessageItem message={item} />
                    </ChatBubbleMessage>
                    {/* Action Icons */}
                    <ChatBubbleActionWrapper>
                      {actionIcons.map(({ icon: Icon, type }) => (
                        <ChatBubbleAction
                          className="size-7"
                          key={type}
                          icon={<Icon className="size-4" />}
                        />
                      ))}
                    </ChatBubbleActionWrapper>
                  </ChatBubble>
                </div>
              )}
            </Suspense>
          )}
        />
        <form className="flex items-center gap-2 mt-3">
          <Button variant="ghost" size="icon" className="h-auto p-2">
            <PlusCircle size={20} />
          </Button>
          <Button variant="ghost" size="icon" className="h-auto p-2">
            <File size={20} />
          </Button>
          <Button variant="ghost" size="icon" className="h-auto p-2">
            <PaperclipIcon size={20} />
          </Button>
          <div className="relative rounded-full w-full border bg-background focus-within:ring-1 focus-within:ring-ring h-auto">
            <ChatInput
              placeholder="Type your message here..."
              className="min-h-12 resize-none rounded-full bg-background border-0 p-3 shadow-none focus-visible:ring-0"
            />
          </div>
          <Button size="icon" variant="ghost">
            <SendIcon size={20} />
          </Button>
        </form>
      </div>
    </>
  )
}
