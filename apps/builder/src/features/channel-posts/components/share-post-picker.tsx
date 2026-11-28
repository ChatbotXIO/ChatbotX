"use client"

import {
  type ChannelPostNotShareableReason,
  getChannelFlowPolicy,
  getChannelPostShareability,
} from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import type { ChannelPostShareRefusalReason } from "@chatbotx.io/utils/channel-post"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Loader2Icon, SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import type { z } from "zod"
import {
  type PickerPost,
  PostGrid,
} from "@/features/shared/comment-automation/post-picker"
import { useWorkspaceId } from "@/hooks/routing"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { orpc } from "@/lib/orpc/query"
import type {
  channelPostManagementCursor,
  channelPostManagementItem,
} from "../schema/management"

type SharePickerPost = z.infer<typeof channelPostManagementItem>
type PickerCursor = z.infer<typeof channelPostManagementCursor>

const PAGE_SIZE = 30
const SEARCH_DEBOUNCE_MS = 400

/** The translation key that explains why a post cannot be sent. */
export const notShareableReasonKey = (
  reason: ChannelPostNotShareableReason,
): `flows.sendChannelPost.reasons.${ChannelPostNotShareableReason}` =>
  `flows.sendChannelPost.reasons.${reason}`

type RefusalReasonKey = `flows.sendChannelPost.reasons.${
  | ChannelPostNotShareableReason
  | "postNotFound"
  | "inboxMismatch"}`

/** The translation key that explains why the server refused to send a post. */
export const refusalReasonKey: Record<
  ChannelPostShareRefusalReason,
  RefusalReasonKey
> = {
  channelPostNotFound: "flows.sendChannelPost.reasons.postNotFound",
  channelPostInboxMismatch: "flows.sendChannelPost.reasons.inboxMismatch",
  channelPostTypeNotShareable: "flows.sendChannelPost.reasons.typeNotShareable",
  channelPostShareUnsupported: "flows.sendChannelPost.reasons.shareUnsupported",
  channelPostLinkUnavailable: "flows.sendChannelPost.reasons.linkUnavailable",
  channelPostLinkTooLong: "flows.sendChannelPost.reasons.linkTooLong",
}

type SharePostPickerProps = {
  inboxId: string
  selectedId: string | null
  onSelect: (post: SharePickerPost) => void
}

/**
 * The posts of one inbox as a grid to pick one to send. A post the inbox's
 * channel cannot send (a kind it does not take, no link) is shown disabled with
 * the reason, never hidden: the same rule the server refuses with.
 */
export function SharePostPicker({
  inboxId,
  selectedId,
  onSelect,
}: SharePostPickerProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS)

  const posts = useInfiniteQuery(
    orpc.channelPostManagementAPIs.privateListPickerChannelPostsAPI.infiniteOptions(
      {
        getNextPageParam: (page) => page.nextCursor ?? undefined,
        initialPageParam: undefined as PickerCursor | undefined,
        input: (cursor: PickerCursor | undefined) => ({
          cursor,
          inboxId,
          limit: PAGE_SIZE,
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
  const pickerPosts = useMemo(
    () =>
      rows.map((post): PickerPost => {
        const shareability = getChannelPostShareability(
          getChannelFlowPolicy(post.channel) ?? { limits: { text: 0 } },
          post,
        )
        return {
          id: post.id,
          message: post.caption ?? undefined,
          full_picture: post.thumbnailUrl ?? undefined,
          created_time: (post.publishedAt ?? new Date(0)).toISOString(),
          ...(shareability.shareable
            ? {}
            : {
                disabledReason: t(notShareableReasonKey(shareability.reason)),
              }),
        }
      }),
    [rows, t],
  )

  const handleToggle = (id: string) => {
    const post = rows.find((candidate) => candidate.id === id)
    if (post) {
      onSelect(post)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon
          aria-hidden
          className="absolute start-2.5 top-2.5 size-4 text-muted-foreground"
        />
        <Input
          aria-label={t("flows.sendChannelPost.search")}
          className="ps-8"
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("flows.sendChannelPost.search")}
          value={search}
        />
      </div>
      {posts.isError ? (
        <div
          className="flex flex-col items-center gap-2 py-8 text-center"
          role="alert"
        >
          <p className="text-destructive text-sm">
            {t("flows.sendChannelPost.loadError")}
          </p>
          <Button
            onClick={() => posts.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("flows.sendChannelPost.retry")}
          </Button>
        </div>
      ) : (
        <PostGrid
          emptyText={t(
            debouncedSearch
              ? "flows.sendChannelPost.noMatch"
              : "flows.sendChannelPost.empty",
          )}
          loading={posts.isPending}
          onToggle={handleToggle}
          posts={pickerPosts}
          selectedIds={selectedId ? [selectedId] : []}
        />
      )}
      {posts.hasNextPage && (
        <Button
          disabled={posts.isFetchingNextPage}
          onClick={() => posts.fetchNextPage()}
          type="button"
          variant="outline"
        >
          {posts.isFetchingNextPage && (
            <Loader2Icon aria-hidden className="size-4 animate-spin" />
          )}
          {t("flows.sendChannelPost.loadMore")}
        </Button>
      )}
    </div>
  )
}
