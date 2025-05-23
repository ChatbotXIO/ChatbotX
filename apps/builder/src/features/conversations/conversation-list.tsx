"use client"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { FilterIcon, UserPlusIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Virtuoso } from "react-virtuoso"
import { useChatStore } from "../chat/store/chat-store-provider"
import { CreateContactDialog } from "../contacts/create-contact-dialog"
import ConversationItem from "./conversation-item"

export default function ConversationList() {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const {
    conversations,
    loadMoreConversations,
    nextCursorConversation,
    isLoadingConversation,
    activeConversationId,
    setActiveConversationId,
  } = useChatStore((state) => state)

  // Check if there are more pages to load
  const hasNextPage =
    conversations.length === 0 || nextCursorConversation !== null

  const [page, setPage] = useState(1)
  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    loadMoreConversations(chatbotId)
  }, [page])

  // Load more items when reaching the end of the list
  const loadMoreItems = () => {
    if (!isLoadingConversation && hasNextPage) {
      setPage((prev) => prev + 1)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 mb-2">
        <Select defaultValue="2" name="liveChatEnabled">
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Human</SelectItem>
            <SelectItem value="0">Bot</SelectItem>
            <SelectItem value="2">All</SelectItem>
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

      <div className="flex-1">
        <Virtuoso
          data={conversations}
          rangeChanged={({ endIndex }) => {
            if (endIndex >= conversations.length - 5) {
              loadMoreItems()
            }
          }}
          itemContent={(_, item) => (
            <ConversationItem
              conversation={item}
              isActive={item.id === activeConversationId}
              onSelect={() => setActiveConversationId(item.id)}
            />
          )}
          components={{
            List: ({ children, ...props }) => (
              <div
                {...props}
                className="virtuoso-item-list flex flex-col gap-1"
              >
                {children}
              </div>
            ),
            Footer: () =>
              isLoadingConversation ? (
                <div className="flex items-center space-x-2 px-3 py-2">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ) : null,
          }}
        />

        {/* <InfiniteLoader
          itemCount={
            hasNextPage ? conversations.length + 1 : conversations.length
          }
          isItemLoaded={isItemLoaded}
          loadMoreItems={loadMoreItems}
        >
          {({ onItemsRendered, ref }) => (
            <AutoSizer>
              {({ height, width }) => (
                <FixedSizeList
                  ref={ref}
                  onItemsRendered={onItemsRendered}
                  height={height}
                  itemCount={conversations.length}
                  itemSize={72}
                  width={width}
                >
                  {Row}
                </FixedSizeList>
              )}
            </AutoSizer>
          )}
        </InfiniteLoader> */}
      </div>
    </div>
  )
}
