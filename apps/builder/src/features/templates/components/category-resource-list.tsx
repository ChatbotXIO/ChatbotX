"use client"

import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { ScrollArea } from "@chatbotx.io/ui/components/ui/scroll-area"
import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import { SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { client } from "@/lib/orpc/orpc"
import type { CategorySelectionState } from "../lib/selection"

const PAGE_SIZE = 100
const SEARCH_DEBOUNCE_MS = 300

type ResourceItem = {
  id: string
  name: string
  folderName?: string
}

type CategoryResourceListProps = {
  workspaceId: string
  category: TemplateCategory
  selection: CategorySelectionState
  onChange: (next: CategorySelectionState) => void
  /** Reports the category's unfiltered total, so the parent card can render
   * "All (N)" for a `mode:"all"` selection instead of a blank badge. */
  onTotalChange?: (total: number) => void
}

/**
 * Lazy per-category loader — only fetches once this category's accordion
 * row is expanded (`initialized` gates the effect so re-expanding never
 * refetches), following the `ig-comment-posts-store.ts` shape but as local
 * component state since there is no cross-component sharing need here.
 *
 * Tri-state select-all uses the checkbox's native `indeterminate` prop,
 * computed against `total` (the unfiltered category count) rather than the
 * currently loaded `items`, so it doesn't under-report once pagination or a
 * search has narrowed what's on screen.
 *
 * `allIds` always describes the *unfiltered* set: it's only captured from
 * an unfiltered, first-page fetch (`cursor: null` AND no search keyword),
 * and is never overwritten by a search result — searching narrows `items`
 * but must never narrow what "select all" means. Unchecking a single row
 * while `mode:"all"` downgrades to an explicit id list built from `allIds`
 * when available (exact whenever `total <= 1000`); otherwise there is no
 * exact base to downgrade from, so the downgrade re-fetches the full
 * unfiltered id list rather than silently falling back to just the loaded
 * page.
 */
export function CategoryResourceList({
  workspaceId,
  category,
  selection,
  onChange,
  onTotalChange,
}: CategoryResourceListProps) {
  const t = useTranslations()
  const [items, setItems] = useState<ResourceItem[]>([])
  const [allIds, setAllIds] = useState<string[] | undefined>(undefined)
  const [total, setTotal] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [keyword, setKeyword] = useState("")
  const [loading, setLoading] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const fetchPage = async (cursor: string | null, searchKeyword: string) => {
    setLoading(true)
    try {
      const result = await client.templatesAPI.listSelectableResourcesAPI({
        workspaceId,
        category,
        keyword: searchKeyword || undefined,
        cursor: cursor ?? undefined,
        limit: PAGE_SIZE,
      })
      setItems((current) =>
        cursor ? [...current, ...result.items] : result.items,
      )
      setNextCursor(result.nextCursor)
      // Only an unfiltered fetch's total describes the whole category — a
      // search's `total` is the match count, not the category size.
      if (!searchKeyword) {
        setTotal(result.total)
        onTotalChange?.(result.total)
      }
      // `allIds` must only ever be captured/overwritten from an unfiltered
      // first page — a search's result set is a subset and must never
      // replace the unfiltered id list "select all" depends on.
      if (!(cursor || searchKeyword)) {
        setAllIds(result.allIds)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialized) {
      return
    }
    setInitialized(true)
    fetchPage(null, "")
    // biome-ignore lint/correctness/useExhaustiveDependencies: fetch-once-on-mount is intentional, see comment above
  }, [initialized, fetchPage])

  const debouncedSearch = useDebouncedCallback((value: string) => {
    fetchPage(null, value)
  }, SEARCH_DEBOUNCE_MS)

  const selectedIds =
    selection.mode === "ids" ? new Set(selection.ids) : undefined
  const isAllMode = selection.mode === "all"
  const selectedCount = isAllMode ? total : (selectedIds?.size ?? 0)

  const isRowChecked = (id: string): boolean =>
    isAllMode ? true : (selectedIds?.has(id) ?? false)

  const toggleRow = async (id: string, checked: boolean) => {
    if (isAllMode) {
      // Downgrading from "all" to an explicit list must be exact — never
      // silently fall back to just the loaded page. Use `allIds` when we
      // already have the exact unfiltered set; otherwise fetch it fresh.
      const base =
        allIds ??
        (
          await client.templatesAPI.listSelectableResourcesAPI({
            workspaceId,
            category,
            limit: total,
          })
        ).items.map((item) => item.id)
      const next = checked ? base : base.filter((itemId) => itemId !== id)
      onChange({ mode: "ids", ids: next })
      return
    }
    const current = selection.mode === "ids" ? selection.ids : []
    const next = checked
      ? [...new Set([...current, id])]
      : current.filter((itemId) => itemId !== id)
    onChange({ mode: "ids", ids: next })
  }

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      onChange({ mode: "ids", ids: [] })
      return
    }
    onChange(allIds ? { mode: "ids", ids: allIds } : { mode: "all" as const })
  }

  const allRowsSelected = total > 0 && selectedCount >= total
  const someRowsSelected = selectedCount > 0 && !allRowsSelected

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            onChange={(event) => {
              setKeyword(event.target.value)
              debouncedSearch(event.target.value)
            }}
            placeholder={t("actions.search")}
            value={keyword}
          />
        </div>
        <span className="whitespace-nowrap text-muted-foreground text-sm">
          {t("templates.form.selectedCount", { count: selectedCount })}
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={allRowsSelected}
          id={`${category}-select-all`}
          indeterminate={someRowsSelected}
          onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
        />
        <Label
          className="cursor-pointer font-normal"
          htmlFor={`${category}-select-all`}
        >
          {t("templates.form.selectAll")}
        </Label>
      </div>

      <ScrollArea className="h-64 rounded-md border">
        <div className="flex flex-col">
          {items.map((item) => (
            <div
              className="flex items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50"
              key={item.id}
            >
              <Checkbox
                checked={isRowChecked(item.id)}
                id={`${category}-${item.id}`}
                onCheckedChange={(checked) =>
                  toggleRow(item.id, Boolean(checked))
                }
              />
              <Label
                className="flex-1 cursor-pointer truncate font-normal"
                htmlFor={`${category}-${item.id}`}
              >
                {item.name}
              </Label>
              {item.folderName ? (
                <span className="ml-auto truncate text-muted-foreground text-xs">
                  {item.folderName}
                </span>
              ) : null}
            </div>
          ))}
          {items.length === 0 && !loading ? (
            <p className="px-3 py-6 text-center text-muted-foreground text-sm">
              {t("actions.noRecordFound")}
            </p>
          ) : null}
        </div>
      </ScrollArea>

      {nextCursor ? (
        <Button
          disabled={loading}
          onClick={() => fetchPage(nextCursor, keyword)}
          variant="outline"
        >
          {t("actions.loadMore")}
        </Button>
      ) : null}
    </div>
  )
}
