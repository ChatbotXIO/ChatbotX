"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aha.chat/ui/components/ui/select"
import { useSidebar } from "@aha.chat/ui/components/ui/sidebar"
import { Skeleton } from "@aha.chat/ui/components/ui/skeleton"
import { FilterIcon, PanelLeftClose, UserPlusIcon } from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"
import { type GridComponents, Virtuoso } from "react-virtuoso"
import { useChatStore } from "../chat/store/chat-store-provider"
import { CreateContactDialog } from "../contacts/create-contact-dialog"
import ConversationItem from "./conversation-item"

export default function ConversationList() {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    conversations,
    loadMoreConversations,
    nextCursorConversation,
    isLoadingConversation,
    activeConversationId,
    setActiveConversationId,
  } = useChatStore((state) => state)
  const { toggleSidebar, open } = useSidebar()

  // Check if there are more pages to load
  const hasNextPage =
    conversations.length === 0 || nextCursorConversation !== null

  const [page, setPage] = useState(1)
  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
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
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-1">
        <Button
          data-sidebar="trigger"
          data-slot="sidebar-trigger"
          onClick={() => {
            toggleSidebar()
          }}
          size="icon"
          variant="ghost"
        >
          {open ? (
            <PanelLeftClose />
          ) : (
            <PanelLeftClose className="rotate-180" />
          )}
        </Button>
        <Select defaultValue="2" name="liveChatEnabled">
          <SelectTrigger className="h-8 w-[180px] text-xs">
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
            <Button className="px-2" size="sm" variant="outline">
              <UserPlusIcon />
            </Button>
          }
        />

        <Button className="px-2" size="sm" variant="outline">
          <FilterIcon />
        </Button>
      </div>

      <div className="flex-1">
        <Virtuoso
          components={{
            List: ConversationListList,
            Footer: ConversationListFooter,
          }}
          data={conversations}
          itemContent={(_, item) => (
            <ConversationItem
              conversation={item}
              isActive={item.id === activeConversationId}
              onSelect={() => {
                setActiveConversationId(item.id)

                // Update the URL with the selected conversation ID
                const params = new URLSearchParams(searchParams.toString())
                params.set("conversationId", item.id)
                router.replace(`?${params.toString()}`)
              }}
            />
          )}
          rangeChanged={({ endIndex }) => {
            if (endIndex >= conversations.length - 5) {
              loadMoreItems()
            }
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

const ConversationListFooter: GridComponents["Footer"] = () => {
  const { isLoadingConversation } = useChatStore((state) => state)

  return isLoadingConversation ? (
    <div className="flex items-center space-x-2 px-3 py-2">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  ) : null
}

const ConversationListList: GridComponents["List"] = ({
  children,
  ...props
}) => (
  <div {...props} className="virtuoso-item-list flex flex-col gap-1">
    {children}
  </div>
)
