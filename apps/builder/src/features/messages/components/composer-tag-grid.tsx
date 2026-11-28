"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { tagChipStyle } from "@chatbotx.io/utils/color"
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query"
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
  COMPOSER_TAG_PAGE_SIZE,
  COMPOSER_TAG_SEARCH_DEBOUNCE_MS,
  type ComposerTagDisabledReason,
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
  const color = tag.color
  return (
    <button
      aria-pressed={isApplied}
      className={cn(
        "relative flex h-7 min-w-0 items-center justify-center rounded-sm px-3 text-center text-xs outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed",
        !color && "bg-muted text-foreground",
        !isDisabled && "hover:opacity-80",
        isDisabled && "opacity-40",
        isSettling && "animate-pulse opacity-70",
      )}
      data-applied={isApplied}
      disabled={isDisabled}
      onClick={() => onToggle(tag, isApplied)}
      onFocus={onFocus}
      style={tagChipStyle(color)}
      title={tag.name}
      type="button"
    >
      {isApplied && (
        <span
          aria-hidden
          className="absolute top-1 left-1 size-1.5 rounded-full bg-current"
          data-applied-dot
        />
      )}
      <span className="min-w-0 truncate">{tag.name}</span>
    </button>
  )
}

/**
 * Every workspace tag as a filled, equal-width cell above the composer, a corner dot on the ones
 * the open contact has. A click adds or removes the tag at once; the contact
 * is re-read when the request settles (`useComposerTagToggle`).
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
      }),
    }),
    // Keep the chips on screen while a new search loads.
    placeholderData: keepPreviousData,
  })

  const contactQuery = useQuery(
    orpc.contactsAPIs.getContactAuthenticatedAPI.queryOptions({
      input: { workspaceId, contactId: contactId ?? "" },
      enabled: Boolean(contactId),
    }),
  )

  const hasNoContactAccess =
    contactQuery.isError && isContactAccessError(contactQuery.error)
  // Any other failure is not a permission verdict: offer a retry.
  const contactLoadFailed = contactQuery.isError && !hasNoContactAccess

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
  const appliedTagIds = useMemo(
    () => new Set((contactQuery.data?.tags ?? []).map((tag) => tag.id)),
    [contactQuery.data],
  )

  // Whether the chips need more than the collapsed rows; re-measured when the
  // list or the available width changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: tags.length re-measures after a page loads
  useEffect(() => {
    const element = gridRef.current
    if (!element) {
      return
    }
    const measure = () =>
      setIsOverflowing(element.scrollHeight > COMPOSER_TAG_COLLAPSED_MAX_PX + 1)
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
      <div className="flex items-center gap-1.5">
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

      {disabledReason && (
        <p className="text-muted-foreground text-xs" role="status">
          {t(disabledReasonKey[disabledReason])}
        </p>
      )}

      {isLoading && (
        <div
          aria-busy
          className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-0.5"
        >
          {SKELETON_CHIP_KEYS.map((key) => (
            <Skeleton className="h-7 rounded-sm" key={key} />
          ))}
        </div>
      )}

      {(tagsQuery.isError || contactLoadFailed) && (
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <span>
            {tagsQuery.isError ? t("loadError") : t("contactLoadError")}
          </span>
          <Button
            className="h-6 px-2 text-xs"
            onClick={() =>
              tagsQuery.isError ? tagsQuery.refetch() : contactQuery.refetch()
            }
            size="sm"
            type="button"
            variant="ghost"
          >
            {tActions("retry")}
          </Button>
        </div>
      )}

      {hasNoTagsAtAll && (
        <p className="text-muted-foreground text-xs">
          {search ? t("noMatch") : t("empty")}
        </p>
      )}

      {tags.length > 0 && (
        <div
          className={cn(
            "relative grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] content-start gap-0.5",
            isExpanded ? "max-h-52 overflow-y-auto" : "overflow-hidden",
          )}
          ref={gridRef}
          style={
            isExpanded
              ? undefined
              : { maxHeight: COMPOSER_TAG_COLLAPSED_MAX_PX }
          }
        >
          {tags.map((tag) => (
            <TagChip
              isApplied={isTagShownApplied({
                tagId: tag.id,
                appliedTagIds,
                unsettled,
              })}
              isDisabled={
                disabledReason !== null ||
                contactQuery.isPending ||
                contactQuery.isError
              }
              isSettling={unsettled.has(tag.id)}
              key={tag.id}
              onFocus={onFocusChip}
              onToggle={onToggle}
              tag={tag}
            />
          ))}
          {isExpanded && tagsQuery.hasNextPage && (
            <Button
              className="col-span-full h-7 px-2 text-xs"
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
