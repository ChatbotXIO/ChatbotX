"use client"

import { AssignerFilterType, ConversationType } from "@aha.chat/database/enums"
import { Omnichannel } from "@aha.chat/database/types"
import { InputField } from "@aha.chat/ui/components/form/input-field"
import { SelectField } from "@aha.chat/ui/components/form/select-field"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Form } from "@aha.chat/ui/components/ui/form"
import { Skeleton } from "@aha.chat/ui/components/ui/skeleton"
import { SearchIcon, UserPlusIcon } from "lucide-react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { type GridComponents, Virtuoso } from "react-virtuoso"
import { useDebouncedCallback } from "use-debounce"
import type { ConversationFilters } from "../chat/store/chat-store"
import { useChatStore } from "../chat/store/chat-store-provider"
import { CreateContactDialog } from "../contacts/create-contact-dialog"
import { ConversationFilter } from "./conversation-filter"
import ConversationItem from "./conversation-item"

export default function ConversationList() {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const {
    conversations,
    loadMoreConversations,
    filters,
    setFilters,
    resetState,
    nextCursorConversation,
    isLoadingConversation,
    setActiveConversationId,
  } = useChatStore((state) => state)

  const [showSearchInput, setShowSearchInput] = useState(false)

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

  const handleChange = useDebouncedCallback(() => {
    resetState()
    loadMoreConversations(chatbotId)
  }, 300)

  const form = useForm<ConversationFilters>({
    defaultValues: {
      keyword: "",
      liveChatEnabled: undefined,
      inboxType: Omnichannel,
      assignedUserId: AssignerFilterType.all,
      status: [],
      contactFilter: {
        operator: "and",
        conditions: [],
      },
    },
  })

  useEffect(() => {
    const subscription = form.watch((values) => {
      setFilters(values as ConversationFilters)
      handleChange()
    })
    return () => subscription.unsubscribe()
  }, [form, handleChange, setFilters])

  return (
    <Form {...form}>
      <form className="flex h-full flex-col">
        <div className="mb-2 flex items-center gap-1">
          <SelectField
            name="conversationType"
            options={[
              { label: "Human", value: ConversationType.human },
              { label: "Bot", value: ConversationType.bot },
              { label: "All", value: ConversationType.all },
            ]}
          />

          <Button
            className="px-2"
            onClick={() => {
              setShowSearchInput(!showSearchInput)
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            <SearchIcon className={filters.keyword ? "text-primary" : ""} />
          </Button>

          <CreateContactDialog
            chatbotId={chatbotId}
            trigger={
              <Button className="px-2" size="sm" variant="outline">
                <UserPlusIcon />
              </Button>
            }
          />

          <ConversationFilter />
        </div>

        <div className="flex-1">
          {showSearchInput && (
            <InputField
              className="mb-2"
              name="keyword"
              placeholder={t("actions.search")}
              {...{
                onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                  }
                },
              }}
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
                onSelect={() => {
                  const params = new URLSearchParams(searchParams.toString())
                  params.set("conversationId", item.id)
                  router.replace(`?${params.toString()}`)
                  setActiveConversationId(item.id)
                }}
              />
            )}
            rangeChanged={({ endIndex }) => {
              if (endIndex >= conversations.length - 5) {
                loadMoreItems()
              }
            }}
          />
        </div>
      </form>
    </Form>
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
