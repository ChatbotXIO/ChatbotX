"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { readableTextColor } from "@chatbotx.io/utils/color"
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
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { TagResource } from "@/features/tags/schema/resource"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { orpc } from "@/lib/orpc/query"
import { useComposerTagToggle } from "../hooks/use-composer-tag-toggle"
import {
  COMPOSER_TAG_COLLAPSED_MAX_PX,
  COMPOSER_TAG_PAGE_SIZE,
  COMPOSER_TAG_SEARCH_DEBOUNCE_MS,
  type ComposerTagDisabledReason,
  dedupeById,
  isContactAccessError,
  isTagShownApplied,
  nextTagPageParam,
  resolveComposerTagDisabledReason,
} from "../lib/composer-tag-grid"
import type { TagToggleFailure } from "../lib/tag-toggle-queue"

const SKELETON_CHIP_WIDTHS = ["w-16", "w-24", "w-20", "w-14"] as const

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

type TagChipProps = {
  tag: TagResource
  isApplied: boolean
  isDisabled: boolean
  isSettling: boolean
  onToggle: (tag: TagResource, isApplied: boolean) => void
}

function TagChip({
  tag,
  isApplied,
  isDisabled,
  isSettling,
  onToggle,
}: TagChipProps) {
  const color = tag.color
  const textColor = color ? readableTextColor(color) : undefined
  return (
    <button
      aria-pressed={isApplied}
      className={cn(
        "inline-flex h-6 max-w-44 items-center gap-1 rounded-full border px-2 text-xs outline-none transition-[opacity,box-shadow] focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
        color ? "border-transparent" : "bg-muted text-foreground",
        isApplied ? "opacity-100 ring-1 ring-foreground/30" : "opacity-60",
        !isDisabled && "hover:opacity-100",
        isDisabled && "opacity-40",
        isSettling && "animate-pulse",
      )}
      data-applied={isApplied}
      disabled={isDisabled}
      onClick={() => onToggle(tag, isApplied)}
      style={color ? { backgroundColor: color, color: textColor } : undefined}
      title={tag.name}
      type="button"
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full bg-current",
          !isApplied && "invisible",
        )}
      />
      <span className="truncate">{tag.name}</span>
    </button>
  )
}

/**
 * Every workspace tag as a colored chip above the composer, a dot on the ones
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
    ...orpc.tagsAPI.privateListWorkspaceTagsAPI.infiniteOptions({
      getNextPageParam: nextTagPageParam,
      initialPageParam: 1,
      input: (page: number) => ({
        workspaceId,
        page,
        perPage: COMPOSER_TAG_PAGE_SIZE,
        name: search || undefined,
        sort: [{ id: "name", desc: false }],
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
      dedupeById((tagsQuery.data?.pages ?? []).flatMap((page) => page.data)),
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

  const onToggle = (tag: TagResource, isApplied: boolean) =>
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
            onClick={() => setIsExpanded((previous) => !previous)}
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
        <div aria-busy className="flex flex-wrap gap-1.5">
          {SKELETON_CHIP_WIDTHS.map((width) => (
            <Skeleton className={cn("h-6 rounded-full", width)} key={width} />
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
            "flex flex-wrap content-start gap-1.5",
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
              onToggle={onToggle}
              tag={tag}
            />
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
