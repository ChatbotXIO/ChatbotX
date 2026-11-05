"use client"

import type { TemplateCategory } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { ScrollArea } from "@chatbotx.io/ui/components/ui/scroll-area"
import { SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { type CategorySelectionState, isItemLocked } from "../lib/selection"
import { useCategorySelection } from "../lib/use-category-selection"
import { useSelectableResources } from "../lib/use-selectable-resources"
import { ResourceRow } from "./resource-row"

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
 * Lazy per-category picker: mounted (and so fetched) only when its accordion
 * row is expanded. Paging, search and the unfiltered `total` / `allIds` that
 * "select all" depends on live in `useSelectableResources`; the select-all,
 * lock-all and per-row handlers in `useCategorySelection`.
 *
 * Tri-state select-all uses the checkbox's native `indeterminate` prop,
 * computed against `total` (the unfiltered category count) rather than the
 * loaded rows, so it doesn't under-report once pagination or a search has
 * narrowed what's on screen. Searching narrows the rows but must never narrow
 * what "select all" means.
 */
export function CategoryResourceList({
  workspaceId,
  category,
  selection,
  onChange,
  onTotalChange,
}: CategoryResourceListProps) {
  const t = useTranslations()
  const [keyword, setKeyword] = useState("")
  const resources = useSelectableResources({
    workspaceId,
    category,
    keyword,
    onTotalChange,
  })
  const chosen = useCategorySelection({
    selection,
    onChange,
    allIds: resources.allIds,
    total: resources.total,
    fetchAllIds: resources.fetchAllIds,
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1">
          <SearchIcon
            aria-hidden="true"
            className="absolute start-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label={t("actions.search")}
            className="ps-8"
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t("actions.search")}
            value={keyword}
          />
        </div>
        <span className="whitespace-nowrap text-muted-foreground text-sm">
          {t("templates.form.selectedCount", { count: chosen.selectedCount })}
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={chosen.allRowsSelected}
          id={`${category}-select-all`}
          indeterminate={chosen.someRowsSelected}
          onCheckedChange={(checked) =>
            chosen.toggleSelectAll(Boolean(checked))
          }
        />
        <Label
          className="cursor-pointer font-normal"
          htmlFor={`${category}-select-all`}
        >
          {t("templates.form.selectAll")}
        </Label>
        <Checkbox
          checked={chosen.allSelectedLocked}
          className="ms-auto"
          disabled={chosen.selectedCount === 0}
          id={`${category}-lock-all`}
          onCheckedChange={(checked) => chosen.toggleLockAll(Boolean(checked))}
        />
        <Label
          className="cursor-pointer font-normal"
          htmlFor={`${category}-lock-all`}
        >
          {t("templates.form.viewOnlyAll")}
        </Label>
      </div>

      <ScrollArea className="h-64 rounded-md border">
        <div className="flex flex-col">
          {resources.items.map((item) => (
            <ResourceRow
              idPrefix={category}
              isChecked={chosen.isRowChecked(item.id)}
              isViewOnly={isItemLocked(selection, item.id)}
              item={item}
              key={item.id}
              onCheckedChange={(checked) => chosen.toggleRow(item.id, checked)}
              onViewOnlyChange={(viewOnly) =>
                chosen.toggleRowLock(item.id, viewOnly)
              }
            />
          ))}
          {resources.isError ? (
            <div className="flex items-center justify-center gap-2 px-3 py-6 text-muted-foreground text-sm">
              <span role="alert">{t("messages.errorLoadingData")}</span>
              <Button
                onClick={() => resources.refetch()}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("actions.retry")}
              </Button>
            </div>
          ) : null}
          {resources.items.length === 0 &&
          !resources.isLoading &&
          !resources.isError ? (
            <p className="px-3 py-6 text-center text-muted-foreground text-sm">
              {t("actions.noRecordFound")}
            </p>
          ) : null}
        </div>
      </ScrollArea>

      {resources.hasNextPage ? (
        <Button
          disabled={resources.isFetchingNextPage}
          onClick={() => resources.fetchNextPage()}
          variant="outline"
        >
          {t("actions.loadMore")}
        </Button>
      ) : null}
    </div>
  )
}
