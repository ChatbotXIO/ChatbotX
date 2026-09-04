"use client"

import {
  assignerFilterTypes,
  channelTypes,
  conversationBotCategories,
} from "@chatbotx.io/database/partials"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { SelectField } from "@chatbotx.io/ui/components/form/select-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { SearchIcon, UserPlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { type GridComponents, Virtuoso } from "react-virtuoso"
import { toast } from "sonner"
import { useDebouncedCallback } from "use-debounce"
import type { ConversationFilters } from "../chat/store/chat-store"
import { useChatStore } from "../chat/store/chat-store-provider"
import { CreateContactDialog } from "../contacts/create-contact-dialog"
import { ConversationFilter } from "./conversation-filter"
import ConversationItem from "./conversation-item"
import { useConversationIdParam } from "./hooks/use-conversation-id-param"

export default function ConversationList({
  canViewEmailAndPhone = true,
  workspaceId,
  autoSelectFirstConversation = true,
}: {
  canViewEmailAndPhone?: boolean
  workspaceId: string
  /**
   * Whether an empty selection may be filled in with the first conversation
   * once the list loads.
   *
   * The mobile inbox passes `false`: there the list remounts every time the
   * user returns from the thread via the back control, and auto-selecting
   * would immediately reopen a thread instead of showing the list.
   */
  autoSelectFirstConversation?: boolean
}) {
  const t = useTranslations()
  const conversationIdParam = useConversationIdParam()
  const {
    conversations,
    loadMoreConversations,
    filters,
    setFilters,
    resetState,
    nextCursorConversation,
    isLoadingConversation,
    setActiveConversationId,
    initActiveConversationFromUrl,
  } = useChatStore((state) => state)

  const [showSearchInput, setShowSearchInput] = useState(false)

  // Check if there are more pages to load
  const hasNextPage =
    conversations.length === 0 || nextCursorConversation !== null

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount; a remount (e.g. the mobile back control) must not refetch or re-auto-select
  useEffect(() => {
    loadMoreConversations(workspaceId, {
      autoSelectFirst: autoSelectFirstConversation,
    }).catch(() => {
      toast.error(t("messages.errorLoadingData"))
    })
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount to resolve deep-linked conversation
  useEffect(() => {
    initActiveConversationFromUrl(workspaceId)
  }, [])

  // Load more items when reaching the end of the list
  const loadMoreItems = () => {
    if (!isLoadingConversation && hasNextPage) {
      loadMoreConversations(workspaceId, {
        autoSelectFirst: autoSelectFirstConversation,
      }).catch(() => {
        toast.error(t("messages.errorLoadingData"))
      })
    }
  }

  const handleChange = useDebouncedCallback(() => {
    conversationIdParam.clear()
    resetState()
    loadMoreConversations(workspaceId, {
      respectUrlConversationId: false,
      autoSelectFirst: autoSelectFirstConversation,
    }).catch(() => {
      toast.error(t("messages.errorLoadingData"))
    })
  }, 300)

  const form = useForm<ConversationFilters>({
    defaultValues: {
      keyword: "",
      botCategory: conversationBotCategories.enum.all,
      channel: channelTypes.enum.omnichannel,
      assignedId: assignerFilterTypes.enum.all,
      tags: [],
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
      <form className="flex h-full min-h-0 flex-col">
        <div className="mb-2 flex shrink-0 items-center gap-1">
          <SelectField
            name="botCategory"
            options={[
              { label: "All", value: conversationBotCategories.enum.all },
              { label: "Human", value: conversationBotCategories.enum.human },
              { label: "Bot", value: conversationBotCategories.enum.bot },
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
            trigger={
              <Button className="px-2" size="sm" variant="outline">
                <UserPlusIcon />
              </Button>
            }
            workspaceId={workspaceId}
          />

          <ConversationFilter canViewEmailAndPhone={canViewEmailAndPhone} />
        </div>

        {/* A sibling of the scroller, not a child of it: inside the `flex-1`
            block this would stack on top of Virtuoso's `height: 100%` scroller
            and overflow the pane by its own height. */}
        {showSearchInput && (
          <InputField
            formItemClassName="mb-2 shrink-0"
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

        {/* `min-h-0` for the same reason as the message list: Virtuoso's
            scroller is `height: 100%` and would otherwise floor this item at
            the full list height. */}
        <div className="min-h-0 flex-1">
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
                  conversationIdParam.set(item.id.toString())
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
