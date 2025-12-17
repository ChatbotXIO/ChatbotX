"use client"

import { ConversationType } from "@aha.chat/database/enums"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Input } from "@aha.chat/ui/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@aha.chat/ui/components/ui/select"
import { Skeleton } from "@aha.chat/ui/components/ui/skeleton"
import { SearchIcon, UserPlusIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { type GridComponents, Virtuoso } from "react-virtuoso"
import { useDebouncedCallback } from "use-debounce"
import { useChatStore } from "../chat/store/chat-store-provider"
import { CreateContactDialog } from "../contacts/create-contact-dialog"
import type { InboxResource } from "../inboxes/schemas/resource"
import { ConversationFilter } from "./conversation-filter"
import ConversationItem from "./conversation-item"

type ConversationListProps = {
  inboxes: InboxResource[]
}

export default function ConversationList({ inboxes }: ConversationListProps) {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const {
    conversations,
    loadMoreConversations,
    filters,
    setFilters,
    resetState,
    nextCursorConversation,
    isLoadingConversation,
    activeConversationId,
    setActiveConversationId,
  } = useChatStore((state) => state)

  const [showSearchInput, setShowSearchInput] = useState(false)
  const [searchText, setSearchText] = useState("")

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

  const handleChange = useDebouncedCallback((value: string) => {
    resetState()
    setFilters({
      ...filters,
      searchText: value,
    })
    loadMoreConversations(chatbotId)
  }, 300)

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchText(e.target.value)
      handleChange(e.target.value)
    },
    [handleChange],
  )

  const handleChangeType = useCallback(
    (value: string) => {
      resetState()
      setFilters({
        ...filters,
        conversationType: value,
      })
      loadMoreConversations(chatbotId)
    },
    [filters, resetState, setFilters, loadMoreConversations, chatbotId],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-1">
        <Select
          defaultValue={ConversationType.all}
          onValueChange={handleChangeType}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ConversationType.human}>Human</SelectItem>
            <SelectItem value={ConversationType.bot}>Bot</SelectItem>
            <SelectItem value={ConversationType.all}>All</SelectItem>
          </SelectContent>
        </Select>

        <Button
          className="px-2"
          onClick={() => {
            setShowSearchInput(!showSearchInput)
          }}
          size="sm"
          variant="outline"
        >
          <SearchIcon className={searchText ? "text-primary" : ""} />
        </Button>

        <CreateContactDialog
          chatbotId={chatbotId}
          trigger={
            <Button className="px-2" size="sm" variant="outline">
              <UserPlusIcon />
            </Button>
          }
        />

        <ConversationFilter
          inboxes={inboxes}
          onChange={(value) => {
            resetState()
            setFilters({
              ...filters,
              ...value,
            })
            loadMoreConversations(chatbotId)
          }}
        />
      </div>

      <div className="flex-1">
        {showSearchInput && (
          <Input
            className="mb-2"
            onChange={handleTextChange}
            placeholder={t("actions.search")}
            value={searchText}
          />
        )}
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
              onSelect={() => setActiveConversationId(item.id)}
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
