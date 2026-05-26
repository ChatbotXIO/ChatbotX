"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { Separator } from "@chatbotx.io/ui/components/ui/separator"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useChatStore } from "@/features/chat/store/chat-store-provider"

type ArchiveFilter = "all" | "open" | "closed"
type SortOrder = "desc" | "asc"

type ConversationDisplayFilterProps = {
  workspaceId: string
  onOpenAdvancedFilter?: () => void
}

export function ConversationDisplayFilter({
  workspaceId,
  onOpenAdvancedFilter,
}: ConversationDisplayFilterProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const filters = useChatStore((state) => state.filters)
  const setFilters = useChatStore((state) => state.setFilters)
  const resetState = useChatStore((state) => state.resetState)
  const loadMoreConversations = useChatStore(
    (state) => state.loadMoreConversations,
  )

  const archiveFilter: ArchiveFilter = filters.archiveFilter ?? "open"
  const sortOrder: SortOrder = filters.sortOrder ?? "desc"

  const applyChange = (next: Partial<typeof filters>) => {
    setFilters({ ...filters, ...next })
    resetState()
    loadMoreConversations(workspaceId)
  }

  const archiveLabel: Record<ArchiveFilter, string> = {
    all: t("inboxDisplayFilter.show.all"),
    open: t("inboxDisplayFilter.show.open"),
    closed: t("inboxDisplayFilter.show.closed"),
  }

  const sortLabel: Record<SortOrder, string> = {
    desc: t("inboxDisplayFilter.sort.recent"),
    asc: t("inboxDisplayFilter.sort.oldest"),
  }

  const archiveOptions: { value: ArchiveFilter; label: string }[] = [
    { value: "all", label: archiveLabel.all },
    { value: "open", label: archiveLabel.open },
    { value: "closed", label: archiveLabel.closed },
  ]

  const sortOptions: { value: SortOrder; label: string }[] = [
    { value: "desc", label: sortLabel.desc },
    { value: "asc", label: sortLabel.asc },
  ]

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button className="h-8 gap-1 px-2" size="sm" variant="ghost">
          <span className="truncate font-medium text-sm">
            {archiveLabel[archiveFilter]}, {sortLabel[sortOrder]}
          </span>
          <ChevronDownIcon className="size-4 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">
              {t("inboxDisplayFilter.showLabel")}
            </span>
            {archiveOptions.map((option) => (
              <RadioRow
                checked={archiveFilter === option.value}
                key={option.value}
                label={option.label}
                onClick={() => applyChange({ archiveFilter: option.value })}
              />
            ))}
          </div>

          <Separator />

          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">
              {t("inboxDisplayFilter.sortLabel")}
            </span>
            {sortOptions.map((option) => (
              <RadioRow
                checked={sortOrder === option.value}
                key={option.value}
                label={option.label}
                onClick={() => applyChange({ sortOrder: option.value })}
              />
            ))}
          </div>

          {onOpenAdvancedFilter && (
            <>
              <Separator />
              <button
                className="text-left text-primary text-sm hover:underline"
                onClick={() => {
                  setOpen(false)
                  onOpenAdvancedFilter()
                }}
                type="button"
              >
                {t("inboxDisplayFilter.advanced")}
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function RadioRow({
  checked,
  label,
  onClick,
}: {
  checked: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent/50"
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-primary" : "border-input",
        )}
      >
        {checked && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  )
}
