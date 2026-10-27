"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import {
  BarChart3Icon,
  FilterIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  XIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useState } from "react"
import { formatItemValue } from "../../lib/format-item-value"
import { itemNounKeys } from "../../lib/item-noun"
import { SortPopover } from "./sort-popover"
import type { BoardPipeline, BoardSortInput } from "./types"

const SEARCH_DEBOUNCE_MS = 300

export type BoardPanel = "filter" | "settings" | "analytics" | "add" | null

type BoardToolbarProps = {
  pipeline: BoardPipeline
  totalCount: number
  totalValue: number
  filterCount: number
  query: string
  onQueryChange: (query: string) => void
  sort: BoardSortInput
  hiddenSortKeys: ReadonlySet<string>
  onSortChange: (sort: BoardSortInput) => void
  onOpenPanel: (panel: Exclude<BoardPanel, null>) => void
  canEdit: boolean
  canManageSettings: boolean
}

/** Title, totals and the search / filter / sort / analytics / settings / add controls. */
export function BoardToolbar({
  pipeline,
  totalCount,
  totalValue,
  filterCount,
  query,
  onQueryChange,
  sort,
  hiddenSortKeys,
  onSortChange,
  onOpenPanel,
  canEdit,
  canManageSettings,
}: BoardToolbarProps) {
  const t = useTranslations("pipelines")
  const locale = useLocale()
  const [isSearching, setIsSearching] = useState(query !== "")
  const noun = itemNounKeys[pipeline.type]

  const closeSearch = () => {
    onQueryChange("")
    setIsSearching(false)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      {isSearching ? (
        <div className="flex w-full items-center gap-2">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <BoardSearchInput
            initialQuery={query}
            label={t("board.search")}
            onClose={closeSearch}
            onQueryChange={onQueryChange}
          />
          <Button
            aria-label={t("board.closeSearch")}
            onClick={closeSearch}
            size="icon"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="truncate font-semibold text-xl">{pipeline.name}</h1>
            <Badge
              aria-label={t("board.count", { count: totalCount })}
              className="h-5 px-1.5 text-xs"
              variant="secondary"
            >
              {totalCount}
            </Badge>
            {pipeline.settings.visibleFeatures.value ? (
              <Badge className="h-5 px-1.5 text-xs" variant="secondary">
                {formatItemValue(totalValue, pipeline.currency, locale)}
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              onClick={() => setIsSearching(true)}
              size="sm"
              variant="ghost"
            >
              <SearchIcon />
              {t("board.searchAction")}
            </Button>
            <Button
              onClick={() => onOpenPanel("filter")}
              size="sm"
              variant="ghost"
            >
              <FilterIcon />
              {t("board.filter")}
              {filterCount > 0 ? ` (${filterCount})` : ""}
            </Button>
            <SortPopover
              hiddenKeys={hiddenSortKeys}
              onChange={onSortChange}
              sort={sort}
            />
            <Button
              onClick={() => onOpenPanel("analytics")}
              size="sm"
              variant="ghost"
            >
              <BarChart3Icon />
              {t("board.analytics")}
            </Button>
            {canManageSettings ? (
              <Button
                onClick={() => onOpenPanel("settings")}
                size="sm"
                variant="ghost"
              >
                <SettingsIcon />
                {t("board.settings")}
              </Button>
            ) : null}
          </div>
          {canEdit ? (
            <Button onClick={() => onOpenPanel("add")} size="sm">
              <PlusIcon />
              {t(noun.add)}
            </Button>
          ) : null}
        </>
      )}
    </div>
  )
}

/**
 * The search box owns its draft, so typing re-renders only this input; the
 * URL (and the board query) follow after a pause.
 */
function BoardSearchInput({
  initialQuery,
  label,
  onQueryChange,
  onClose,
}: {
  initialQuery: string
  label: string
  onQueryChange: (query: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(initialQuery)
  const commit = useDebouncedCallback(onQueryChange, SEARCH_DEBOUNCE_MS)

  return (
    <Input
      aria-label={label}
      autoFocus
      className="flex-1"
      onChange={(event) => {
        setDraft(event.target.value)
        commit(event.target.value)
      }}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
      placeholder={label}
      value={draft}
    />
  )
}
