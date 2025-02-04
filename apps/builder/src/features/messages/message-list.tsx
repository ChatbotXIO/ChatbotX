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
import type { findConversation } from "@/features/conversations/queries"
import ConversationLoading from "@/features/inbox/conversation-loading"
import { getMessages } from "@/features/messages/queries"
import type { MessageResource } from "@/features/messages/schemas/get-messages-schema"
import type { getTeams } from "@/features/teams/queries"
import type { getUsers } from "@/features/users/queries"
import { cn } from "@/lib/utils"
import { MessageType, SenderType } from "@ahachat.ai/database"
import { Heart, Reply, SendHorizonalIcon, SmileIcon } from "lucide-react"
import { Suspense, use, useCallback, useEffect, useRef, useState } from "react"
import { Virtuoso } from "react-virtuoso"
import type { CursorPagination } from "../common/types"
import MessageHead from "./message-head"
import MessageItem from "./message-item"

interface MessagesProps {
  chatbotId: string
  conversationId: string
  promises: Promise<
    [
      Awaited<ReturnType<typeof findConversation>>,
      Awaited<ReturnType<typeof getUsers>>,
      Awaited<ReturnType<typeof getTeams>>,
    ]
  >
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
  promises,
}: MessagesProps) {
  const data = use(promises)
  const [conversation, setConversation] = useState(data[0].data)
  const [messages, setMessages] = useState<MessageResource[]>([])
  const loadingMore = useRef<boolean>(false)
  const cursor = useRef<CursorPagination | null>(null)
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
      return "justify-start"
    }

    if (senderType === SenderType.System) {
      return "justify-center"
    }

    return "justify-end"
  }

  const getMessageDirection = (
    senderType: SenderType,
  ): "sent" | "received" | null | undefined => {
    if (senderType === SenderType.Contact) {
      return "received"
    }

    if (senderType === SenderType.System) {
      return null
    }

    return "sent"
  }

  return (
    <>
      <div className="h-full flex flex-col">
        <MessageHead
          conversation={conversation}
          users={data[1].data}
          teams={data[2].data}
          onUpdateConversation={(data) =>
            setConversation((prev) => ({
              ...prev,
              ...data,
            }))
          }
        />
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
                    "flex m-2 max-h-[60%]",
                    getPositionClasses(item.senderType),
                  )}
                >
                  <ChatBubble
                    variant={getMessageDirection(item.senderType)}
                    key={item.id}
                    className="items-center"
                  >
                    {/* <ChatBubbleAvatar
                      fallback={item.user?.name ?? ""}
                      src={item.user?.image ?? ""}
                      className="h-8 w-8"
                    /> */}
                    <ChatBubbleMessage
                      variant={getMessageDirection(item.senderType)}
                      className={cn(
                        item.messageType === MessageType.Text ||
                          item.messageType === MessageType.File
                          ? "rounded-xl"
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
        {!conversation.blockedAt && (
          <div className="px-2">
            <form className="rounded-md w-full border bg-background flex flex-col">
              {/* <Button variant="ghost" size="sm" className="h-auto p-2">
              <PlusCircle size={20} />
            </Button>
            <Button variant="ghost" size="sm" className="h-auto p-2">
              <File size={20} />
            </Button>
            <Button variant="ghost" size="sm" className="h-auto p-2">
              <PaperclipIcon size={20} />
            </Button> */}
              <div className="px-2 pt-2 flex-1">
                <ChatInput
                  placeholder="Type your message here..."
                  className="min-h-12 resize-none bg-background border-0 shadow-none focus-visible:ring-0 p-0"
                />
              </div>
              <div className="flex w-full items-center">
                <div className="text-sm text-slate-700 flex-1 pl-2">
                  Messenger
                </div>
                <div>
                  <Button variant="ghost" size="sm" className="px-2.5">
                    <SmileIcon />
                  </Button>
                  <Button variant="ghost" size="sm" className="px-2.5">
                    <SendHorizonalIcon />
                  </Button>
                </div>
                {/* <div>
                  <Button variant="ghost" size="sm">
                    <MenuIcon />
                  </Button>
                  <Button variant="ghost" size="sm">
                    <PaperclipIcon />
                  </Button>
                </div> */}
              </div>
              {/* <Button size="icon" variant="ghost">
              <SendIcon size={20} />
            </Button> */}
            </form>
          </div>
        )}
      </div>
    </>
  )
}
