"use client"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import ConversationItem from "@/features/conversations/conversation-item"
import {
  findConversation,
  listConversations,
} from "@/features/conversations/queries"
import type {
  ConversationResource,
  CursorPagination,
} from "@/features/conversations/schemas/get-conversations-schema"
import ConversationLoading from "@/features/inbox/conversation-loading"
import { generateRandomMessage } from "@/mock/messages.mock"
import type { Message } from "@ahachat.ai/database"
import { FilterIcon, UserPlusIcon } from "lucide-react"
import { parseAsString, useQueryState } from "nuqs"
import { Suspense, use, useEffect, useRef, useState } from "react"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import { CreateContactDialog } from "../contacts/create-contact-dialog"

interface ConversationListProps {
  chatbotId: string
  promises: Promise<Awaited<ReturnType<typeof listConversations>>>
}

export default function ConversationList({
  chatbotId,
  promises,
}: ConversationListProps) {
  const { data, nextCursor: initCursor } = use(promises)
  const [conversations, setConversations] = useState(data)
  const [cursor, setCursor] = useState<CursorPagination | null>(initCursor)
  const [loadingMore, setLoadingMore] = useState<boolean>(false)

  const [activeConversationId, setActiveConversationId] = useQueryState(
    "conversationId",
    parseAsString.withOptions({
      history: "replace",
      shallow: false,
    }),
  )

  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const foundIndex = conversations.findIndex(
    (c) => c.id === activeConversationId,
  )
  const [activeConversationIndex] = useState<number>(
    foundIndex > -1 ? foundIndex : 0,
  )

  const loadMoreConversations = async () => {
    if (loadingMore || !cursor) {
      return
    }

    try {
      setLoadingMore(true)
      const newConversations = await listConversations({
        chatbotId,
        cursor,
      })
      setConversations((prev) => [...prev, ...newConversations.data])
      setCursor(newConversations.nextCursor)
    } catch (err) {
      console.log("err", err)
    } finally {
      setLoadingMore(false)
    }
  }

  const onNewConversation = () => {}

  const mockNewMessageEvent = async () => {
    const message = generateRandomMessage(chatbotId)
    const randomNewConversation = Math.random() < 0.5
    if (!randomNewConversation) {
      message.conversationId = conversations[
        Math.floor(Math.random() * conversations.length)
      ]?.id as string
    }

    await onNewMessage(message)
  }

  const onNewMessage = async (message: Message) => {
    const index = conversations.findIndex(
      (c) => c.id === message.conversationId,
    )
    if (index > -1) {
      const [existingConversation] = conversations.splice(index, 1) as [
        ConversationResource,
      ]
      // existingConversation.latestMessage = message
      existingConversation.updatedAt = message.createdAt
      // existingConversation.unreadCount++
      conversations.unshift(existingConversation)
      setConversations([...conversations])
      return
    }

    const newConversation = await findConversation({
      chatbotId,
      id: message.conversationId,
    })
    if (!newConversation.data) {
      return
    }
    setConversations([
      newConversation.data as ConversationResource,
      ...conversations,
    ])
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
      <div className="flex itesms-center gap-1 mb-2">
        <Select defaultValue="all">
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Select conversations type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="human">Human</SelectItem>
            <SelectItem value="bot">Bot</SelectItem>
            <SelectItem value="all">All Conversations</SelectItem>
          </SelectContent>
        </Select>

        <CreateContactDialog
          chatbotId={chatbotId}
          trigger={
            <Button variant="outline" size="sm" className="px-2">
              <UserPlusIcon />
            </Button>
          }
        />

        <Button variant="outline" size="sm" className="px-2">
          <FilterIcon />
        </Button>
      </div>
      {/* <div className="flex items-center gap-2 p-3">
        <Button onClick={onNewConversation}>Add</Button>
        <Button onClick={mockNewMessageEvent}>New Message</Button>
      </div> */}

      <Virtuoso
        data={conversations}
        ref={virtuosoRef}
        className="flex flex-col gap-2"
        initialItemCount={data.length}
        atBottomStateChange={(atBottom) => atBottom && loadMoreConversations()}
        itemContent={(_, item) => (
          <Suspense fallback={<ConversationLoading />}>
            <ConversationItem
              conversation={item}
              isActive={item.id === activeConversationId}
              onSelect={() => setActiveConversationId(item.id)}
            />
          </Suspense>
        )}
      />
    </>
  )
}
