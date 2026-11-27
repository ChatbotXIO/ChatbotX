"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Loader2Icon, SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import type { z } from "zod"
import { useInboxList } from "@/features/inboxes/provider/inbox-hook"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { orpc } from "@/lib/orpc/query"
import { channelsReportLive } from "../lib/post-capability"
import {
  availablePostTypeFilters,
  POST_TYPE_QUERIES,
  type PostTypeFilter,
} from "../lib/posts-search-params"
import type { channelPostManagementCursor } from "../schema/management"
import type { ManagedPost } from "./post-row"

type PostsCursor = z.infer<typeof channelPostManagementCursor>

/** Posts that went live within this window are pre-selected. */
const RECENT_LIVE_WINDOW_MS = 3 * 60 * 60 * 1000
/** Most posts one merged view can read (the service caps it too). */
const MAX_MERGED_POSTS = 20
const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 400

/** A live stream that is on air, or ended, within the window. */
const isRecentLive = (post: ManagedPost, now: number): boolean =>
  (post.liveStatus === "live" || post.liveStatus === "ended") &&
  post.publishedAt !== null &&
  now - post.publishedAt.getTime() <= RECENT_LIVE_WINDOW_MS

/**
 * Pick several posts and read their comments as one thread, e.g. during a
 * livestream. The posts that went live in the last three hours start selected.
 */
export const MergePostsDialog = ({
  onMerge,
  onOpenChange,
  open,
  workspaceId,
}: {
  onMerge: (posts: ManagedPost[]) => void
  onOpenChange: (open: boolean) => void
  open: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const [search, setSearch] = useState("")
  const [postType, setPostType] = useState<PostTypeFilter | null>(null)
  const [selection, setSelection] = useState<Record<string, ManagedPost>>({})
  const [preselected, setPreselected] = useState(false)
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS)
  const typeQuery = postType ? POST_TYPE_QUERIES[postType] : {}
  // Live posts exist only for a channel that reports live status.
  const liveSupported = channelsReportLive(
    useInboxList().map((inbox) => inbox.channel),
  )
  const postTypeFilters = availablePostTypeFilters(liveSupported)

  const posts = useInfiniteQuery(
    orpc.channelPostManagementAPIs.privateListManagedChannelPostsAPI.infiniteOptions(
      {
        enabled: open,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        initialPageParam: undefined as PostsCursor | undefined,
        input: (cursor: PostsCursor | undefined) => ({
          contentTypes: typeQuery.contentTypes,
          cursor,
          limit: PAGE_SIZE,
          liveStatus: typeQuery.liveStatus,
          search: debouncedSearch || undefined,
          workspaceId,
        }),
      },
    ),
  )
  const rows = useMemo(
    () => posts.data?.pages.flatMap((page) => page.items) ?? [],
    [posts.data],
  )

  // Pre-select the recent live posts once, from the first page that loads.
  if (open && liveSupported && !preselected && rows.length > 0) {
    const now = Date.now()
    const recent = rows.filter((post) => isRecentLive(post, now))
    setPreselected(true)
    if (recent.length > 0) {
      setSelection(
        Object.fromEntries(
          recent.slice(0, MAX_MERGED_POSTS).map((post) => [post.id, post]),
        ),
      )
    }
  }

  const selectedCount = Object.keys(selection).length
  // "All" means every listed post, up to the cap the merged view allows.
  const selectable = rows.slice(0, MAX_MERGED_POSTS)
  const allVisibleSelected =
    selectable.length > 0 && selectable.every((post) => selection[post.id])

  const toggle = (post: ManagedPost) =>
    setSelection((current) => {
      if (current[post.id]) {
        const { [post.id]: _removed, ...rest } = current
        return rest
      }
      if (Object.keys(current).length >= MAX_MERGED_POSTS) {
        return current
      }
      return { ...current, [post.id]: post }
    })
  const toggleAll = () =>
    setSelection(
      allVisibleSelected
        ? {}
        : Object.fromEntries(selectable.map((post) => [post.id, post])),
    )

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          // A reopened dialog starts fresh, including the live pre-selection.
          setSearch("")
          setPostType(null)
          setSelection({})
          setPreselected(false)
        }
        onOpenChange(next)
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("posts.merge.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <SearchIcon className="absolute start-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="ps-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("posts.searchPlaceholder")}
              value={search}
            />
          </div>
          <select
            aria-label={t("posts.filters.postType")}
            className="h-9 rounded-md border bg-background px-2 text-sm"
            onChange={(event) =>
              setPostType(
                postTypeFilters.find((type) => type === event.target.value) ??
                  null,
              )
            }
            value={postType ?? ""}
          >
            <option value="">{t("posts.postType.all")}</option>
            {postTypeFilters.map((type) => (
              <option key={type} value={type}>
                {t(`posts.postType.${type}`)}
              </option>
            ))}
          </select>
        </div>
        <Label className="flex cursor-pointer items-center gap-3 font-normal text-sm">
          <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} />
          {t("posts.merge.selectAll")}
        </Label>
        <div className="max-h-80 overflow-y-auto rounded-md border">
          {posts.isPending ? (
            <div className="flex justify-center p-6">
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {posts.isError ? (
            <p className="p-4 text-destructive text-sm">
              {t("messages.errorLoadingData")}
            </p>
          ) : null}
          {posts.isSuccess && rows.length === 0 ? (
            <p className="p-4 text-center text-muted-foreground text-sm">
              {t("posts.empty")}
            </p>
          ) : null}
          {rows.map((post) => (
            <Label
              className="flex cursor-pointer items-center gap-3 border-b px-3 py-2 font-normal text-sm last:border-b-0 hover:bg-muted/50"
              key={post.id}
            >
              <Checkbox
                checked={Boolean(selection[post.id])}
                onCheckedChange={() => toggle(post)}
              />
              <span className="min-w-0 flex-1 truncate">
                {post.caption || t("posts.noCaption")}
              </span>
              {post.liveStatus === "live" ? (
                <span className="shrink-0 rounded bg-red-500 px-1.5 py-0.5 text-white text-xs">
                  {t("posts.liveNow")}
                </span>
              ) : null}
            </Label>
          ))}
          {posts.hasNextPage ? (
            <div className="flex justify-center p-2">
              <Button
                disabled={posts.isFetchingNextPage}
                onClick={() => posts.fetchNextPage()}
                size="sm"
                variant="ghost"
              >
                {t("posts.loadMore")}
              </Button>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <span className="me-auto self-center text-muted-foreground text-sm">
            {t("posts.merge.selected", {
              count: selectedCount,
              max: MAX_MERGED_POSTS,
            })}
          </span>
          <Button
            disabled={selectedCount === 0}
            onClick={() => onMerge(Object.values(selection))}
          >
            {t("posts.merge.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
