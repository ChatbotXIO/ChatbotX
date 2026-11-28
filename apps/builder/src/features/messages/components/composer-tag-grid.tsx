"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { tagGridCellStyle } from "@chatbotx.io/utils/color"
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Loader2Icon,
  SearchIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { type FocusEvent, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { ListTagOptionsResponse } from "@/features/tags/schema/query"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { dedupeBy } from "@/lib/dedupe-by"
import { orpc } from "@/lib/orpc/query"
import { useComposerTagToggle } from "../hooks/use-composer-tag-toggle"
import {
  COMPOSER_TAG_COLLAPSED_MAX_PX,
  COMPOSER_TAG_MAX_COLUMNS,
  COMPOSER_TAG_PAGE_SIZE,
  COMPOSER_TAG_SEARCH_DEBOUNCE_MS,
  type ComposerTagDisabledReason,
  chunkRemainderFirst,
  composerTagColumns,
  isContactAccessError,
  isTagShownApplied,
  nextTagPageParam,
  resolveComposerTagDisabledReason,
} from "../lib/composer-tag-grid"
import type { TagToggleFailure } from "../lib/tag-toggle-queue"

const SKELETON_CHIP_KEYS = ["a", "b", "c", "d", "e", "f"] as const

/** i18n key (under `composerTags`) per reason the grid is read-only. */
const disabledReasonKey: Record<ComposerTagDisabledReason, string> = {
  noContact: "disabledNoContact",
  blocked: "disabledBlocked",
  noAccess: "disabledNoAccess",
}

type ComposerTagGridProps = {
  workspaceId: string
  /** The conversation's contact; null when the conversation has none. */
  contactId: string | null
  isContactBlocked: boolean
}

type TagOption = ListTagOptionsResponse["data"][number]

type TagChipProps = {
  tag: TagOption
  isApplied: boolean
  isDisabled: boolean
  isSettling: boolean
  onToggle: (tag: TagOption, isApplied: boolean) => void
  onFocus: (event: FocusEvent<HTMLButtonElement>) => void
}

function TagChip({
  tag,
  isApplied,
  isDisabled,
  isSettling,
  onToggle,
  onFocus,
}: TagChipProps) {
  const cellStyle = tagGridCellStyle(tag.color, isApplied)
  return (
    <button
      aria-pressed={isApplied}
      className={cn(
        "relative min-w-0 flex-1 basis-0 cursor-pointer truncate rounded-[2px] px-2 text-center font-normal text-[10px] normal-case leading-[20px] tracking-normal subpixel-antialiased outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset enabled:hover:opacity-70 disabled:cursor-not-allowed",
        // Nearly white tags would read as holes.
        cellStyle.needsOutline && "ring-1 ring-black/10 ring-inset",
        isDisabled && "opacity-50",
        isSettling && "animate-pulse opacity-70",
      )}
      data-applied={isApplied}
      disabled={isDisabled}
      onClick={() => onToggle(tag, isApplied)}
      onFocus={onFocus}
      style={{
        backgroundColor: cellStyle.backgroundColor,
        color: cellStyle.color,
      }}
      title={tag.name}
      type="button"
    >
      {isApplied && (
        <span
          aria-hidden
          className="absolute top-[3px] left-[3px] size-1 rounded-full"
          data-applied-dot
          style={{ backgroundColor: cellStyle.dotColor }}
        />
      )}
      {tag.name}
    </button>
  )
}

/**
 * Every workspace tag as an equal-width cell above the composer: full color and a corner dot on the ones the open contact
 * has (`applied`, from the options call), 40% color on the rest, laid out in
 * rows with the short remainder row first. A click adds or
 * removes the tag at once; the cached pages are patched when the request
 * settles (`useComposerTagToggle`).
 */
export function ComposerTagGrid({
  workspaceId,
  contactId,
  isContactBlocked,
}: ComposerTagGridProps) {
  const t = useTranslations("composerTags")
  const tActions = useTranslations("actions")
  const [searchText, setSearchText] = useState("")
  const [isExpanded, setIsExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [columns, setColumns] = useState(COMPOSER_TAG_MAX_COLUMNS)
  const gridRef = useRef<HTMLDivElement>(null)
  const search = useDebouncedValue(
    searchText.trim(),
    COMPOSER_TAG_SEARCH_DEBOUNCE_MS,
  )

  const tagsQuery = useInfiniteQuery({
    ...orpc.tagsAPI.privateListWorkspaceTagOptionsAPI.infiniteOptions({
      getNextPageParam: nextTagPageParam,
      initialPageParam: 1,
      input: (page: number) => ({
        workspaceId,
        page,
        perPage: COMPOSER_TAG_PAGE_SIZE,
        name: search || undefined,
        // The server says which of this page's tags the contact has.
        contactId: contactId ?? undefined,
      }),
    }),
    // Keep the chips on screen while a new search loads.
    placeholderData: keepPreviousData,
  })

  // The options call checks the member can reach the contact: not found or
  // forbidden means no access. Any other failure is a load error to retry.
  const hasNoContactAccess =
    tagsQuery.isError && isContactAccessError(tagsQuery.error)
  const tagsLoadFailed = tagsQuery.isError && !hasNoContactAccess

  const disabledReason = resolveComposerTagDisabledReason({
    contactId,
    isBlocked: isContactBlocked,
    contactUnavailable: hasNoContactAccess,
  })

  const { toggle, unsettled } = useComposerTagToggle({
    workspaceId,
    contactId: contactId ?? "",
    onError: (failure: TagToggleFailure & { name: string }) =>
      toast.error(
        t(failure.intent === "add" ? "addFailed" : "removeFailed", {
          name: failure.name,
        }),
      ),
  })

  const tags = useMemo(
    () =>
      dedupeBy(
        (tagsQuery.data?.pages ?? []).flatMap((page) => page.data),
        (tag) => tag.id,
      ),
    [tagsQuery.data],
  )
  const rows = useMemo(
    () => chunkRemainderFirst(tags, columns),
    [tags, columns],
  )

  // Cells per row and whether the rows need more than the collapsed height;
  // re-measured when the list or the available width changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tags.length re-measures after a page loads
  useEffect(() => {
    const element = gridRef.current
    if (!element) {
      return
    }
    const measure = () => {
      setColumns(composerTagColumns(element.clientWidth))
      setIsOverflowing(element.scrollHeight > COMPOSER_TAG_COLLAPSED_MAX_PX + 1)
    }
    measure()
    if (typeof ResizeObserver === "undefined") {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [tags.length, isExpanded])

  const isLoading = tagsQuery.isPending
  const hasNoTagsAtAll = !(isLoading || tagsQuery.isError) && tags.length === 0
  const showToggle = isOverflowing || isExpanded || tagsQuery.hasNextPage
  // Search only helps (and is only shown) when the tags overflow the collapsed
  // rows, more pages exist, or a term is active and must stay clearable.
  const showSearch = showToggle || searchText.trim() !== ""

  // A chip clipped by the collapsed height: expand so focus never scrolls
  // the hidden container.
  const onFocusChip = (event: FocusEvent<HTMLButtonElement>) => {
    const target = event.currentTarget
    if (
      !isExpanded &&
      target.offsetTop + target.offsetHeight > COMPOSER_TAG_COLLAPSED_MAX_PX
    ) {
      setIsExpanded(true)
    }
  }

  const onToggle = (tag: TagOption, isApplied: boolean) =>
    toggle({ id: tag.id, name: tag.name }, isApplied ? "remove" : "add")

  return (
    <section
      aria-label={t("title")}
      className="flex flex-col gap-1.5 border-b px-2.5 pb-2"
    >
      {(showSearch || showToggle) && (
        <div className="flex items-center gap-1.5">
          {showSearch && (
            <div className="relative max-w-56 flex-1">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={t("searchLabel")}
                className="h-7 pl-7 text-xs"
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={t("searchPlaceholder")}
                type="search"
                value={searchText}
              />
            </div>
          )}
          {showToggle && (
            <Button
              aria-expanded={isExpanded}
              className="ml-auto h-7 gap-1 px-2 text-xs"
              onClick={() => {
                if (isExpanded && gridRef.current) {
                  // The expanded grid scrolls; collapse back to the first rows.
                  gridRef.current.scrollTop = 0
                }
                setIsExpanded((previous) => !previous)
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {isExpanded ? (
                <ChevronUpIcon aria-hidden className="size-3.5" />
              ) : (
                <ChevronDownIcon aria-hidden className="size-3.5" />
              )}
              {isExpanded ? t("collapse") : t("expand")}
            </Button>
          )}
        </div>
      )}

      {disabledReason && (
        <p className="px-2.5 py-1 text-muted-foreground text-xs" role="status">
          {t(disabledReasonKey[disabledReason])}
        </p>
      )}

      {isLoading && (
        <div aria-busy className="flex gap-px">
          {SKELETON_CHIP_KEYS.map((key) => (
            <Skeleton
              className="h-[20px] min-w-0 flex-1 rounded-[2px]"
              key={key}
            />
          ))}
        </div>
      )}

      {tagsLoadFailed && (
        <div className="flex items-center gap-2 px-2.5 py-1 text-muted-foreground text-xs">
          <span>{t("loadError")}</span>
          <Button
            className="h-6 px-2 text-xs"
            onClick={() => tagsQuery.refetch()}
            size="sm"
            type="button"
            variant="ghost"
          >
            {tActions("retry")}
          </Button>
        </div>
      )}

      {hasNoTagsAtAll && (
        <p className="px-2.5 py-1 text-muted-foreground text-xs">
          {search ? t("noMatch") : t("empty")}
        </p>
      )}

      {tags.length > 0 && (
        <div
          className={cn(
            "relative flex flex-col gap-px",
            isExpanded ? "max-h-52 overflow-y-auto" : "overflow-hidden",
          )}
          ref={gridRef}
          style={
            isExpanded
              ? undefined
              : { maxHeight: COMPOSER_TAG_COLLAPSED_MAX_PX }
          }
        >
          {rows.map((row) => (
            <div className="flex gap-px" key={row[0]?.id}>
              {row.map((tag) => (
                <TagChip
                  isApplied={isTagShownApplied({
                    applied: tag.applied === true,
                    tagId: tag.id,
                    unsettled,
                  })}
                  isDisabled={disabledReason !== null}
                  isSettling={unsettled.has(tag.id)}
                  key={tag.id}
                  onFocus={onFocusChip}
                  onToggle={onToggle}
                  tag={tag}
                />
              ))}
            </div>
          ))}
          {isExpanded && tagsQuery.hasNextPage && (
            <Button
              className="h-6 px-2 text-xs"
              disabled={tagsQuery.isFetchingNextPage}
              onClick={() => tagsQuery.fetchNextPage()}
              size="sm"
              type="button"
              variant="outline"
            >
              {tagsQuery.isFetchingNextPage && (
                <Loader2Icon aria-hidden className="animate-spin" />
              )}
              {t("loadMore")}
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
