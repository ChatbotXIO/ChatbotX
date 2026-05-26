"use client"

import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { SearchIcon, UserPlusIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { type GridComponents, Virtuoso } from "react-virtuoso"
import { useDebouncedCallback } from "use-debounce"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { useChatStore } from "../chat/store/chat-store-provider"
import { CreateContactDialog } from "../contacts/create-contact-dialog"
import { ConversationDisplayFilter } from "./conversation-display-filter"
import ConversationItem from "./conversation-item"

export default function ConversationList({
  workspaceId,
  lifecycleStages = [],
}: {
  workspaceId: string
  lifecycleStages?: LifecycleStageModel[]
}) {
  const t = useTranslations()
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
  const [searchValue, setSearchValue] = useState(filters.keyword ?? "")

  // Check if there are more pages to load
  const hasNextPage =
    conversations.length === 0 || nextCursorConversation !== null

  const [page, setPage] = useState(1)
  // biome-ignore lint/correctness/useExhaustiveDependencies: wip
  useEffect(() => {
    loadMoreConversations(workspaceId)
  }, [page])

  // Load more items when reaching the end of the list
  const loadMoreItems = () => {
    if (!isLoadingConversation && hasNextPage) {
      setPage((prev) => prev + 1)
    }
  }

  const triggerReload = useDebouncedCallback(() => {
    resetState()
    loadMoreConversations(workspaceId)
  }, 300)

  const updateFilters = (next: Partial<typeof filters>) => {
    setFilters({ ...filters, ...next })
    triggerReload()
  }

  const debouncedSearch = useDebouncedCallback((value: string) => {
    setFilters({ ...filters, keyword: value })
    resetState()
    loadMoreConversations(workspaceId)
  }, 400)

  const handleSearchChange = (value: string) => {
    setSearchValue(value)
    debouncedSearch(value)
  }

  const noReplyEnabled = filters.tags?.includes("noAdminReply") ?? false
  const toggleNoReply = (next: boolean) => {
    const current = filters.tags ?? []
    const cleaned = current.filter((tag) => tag !== "noAdminReply")
    const tagsNext = next ? [...cleaned, "noAdminReply" as const] : cleaned
    updateFilters({ tags: tagsNext })
  }

  return (
    // Pixel-perfect Respond.io § 5: container bg #222225 (app-surface),
    // separator border-bottom abaixo do filter bar, cards com border-bottom
    // sutil (rgba(255,255,255,.06)). Pedro pediu 2026-05-24 alinhando ao
    // print do Respond.io ao vivo. ResizablePanel pai já não tem padding.
    <div className="flex h-full flex-col bg-app-surface">
      <div className="flex items-center gap-2 border-white/[0.06] border-b px-3 py-2">
        <ConversationDisplayFilter workspaceId={workspaceId} />
        <div className="flex min-w-0 items-center gap-1.5">
          <Switch
            checked={noReplyEnabled}
            id="inbox-no-reply-toggle"
            onCheckedChange={toggleNoReply}
          />
          <label
            className="cursor-pointer truncate text-muted-foreground text-sm"
            htmlFor="inbox-no-reply-toggle"
          >
            {t("inboxDisplayFilter.noReply")}
          </label>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <CreateContactDialog
            trigger={
              <Button className="size-8 p-0" size="sm" variant="ghost">
                <UserPlusIcon className="size-4" />
              </Button>
            }
            workspaceId={workspaceId}
          />
          <Button
            className="size-8 p-0"
            onClick={() => setShowSearchInput((prev) => !prev)}
            size="sm"
            variant="ghost"
          >
            <SearchIcon
              className={`size-4 ${searchValue ? "text-primary" : ""}`}
            />
          </Button>
        </div>
      </div>

      {showSearchInput && (
        <Input
          className="mx-3 mt-2"
          onChange={(event) => handleSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
            }
          }}
          placeholder={t("inboxDisplayFilter.searchContact")}
          value={searchValue}
        />
      )}

      <div className="flex-1 overflow-hidden">
        <TagStoreProvider workspaceId={workspaceId}>
          <Virtuoso
            components={{
              List: ConversationListList,
              Footer: ConversationListFooter,
            }}
            data={conversations}
            itemContent={(_, item) => (
              <ConversationItem
                conversation={item}
                lifecycleStages={lifecycleStages}
                onSelect={() => {
                  const params = new URLSearchParams(searchParams.toString())
                  params.set("conversationId", item.id.toString())
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
        </TagStoreProvider>
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
  // Sem gap entre cards — separação visual vem do border-bottom de cada
  // ConversationItem (igual Respond.io ao vivo).
  <div {...props} className="virtuoso-item-list flex flex-col">
    {children}
  </div>
)
