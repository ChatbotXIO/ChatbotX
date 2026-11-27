"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { Loader2Icon, PhoneIcon, SearchIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import type { z } from "zod"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { orpc } from "@/lib/orpc/query"
import { type CommentsCache, withCommentLiked } from "../lib/comment-like-cache"
import { capabilityOfChannel } from "../lib/post-capability"
import type { channelPostCommentCursor } from "../schema/management"
import { CommentBubble } from "./comment-bubble"
import type { ManagedPost } from "./post-row"

type CommentsCursor = z.infer<typeof channelPostCommentCursor>

const COMMENTS_PAGE_SIZE = 30

const SEARCH_DEBOUNCE_MS = 400

/** The cached comment pages a like replaced, put back if the like fails. */
type LikeContext = { snapshot: [readonly unknown[], unknown][] }

/**
 * All comments of one post, or of several posts merged into one thread. Shown
 * oldest first like a conversation, with older pages loaded on request.
 */
export const PostCommentsDialog = ({
  canViewPhones,
  onOpenChange,
  posts,
  readOnly,
  workspaceId,
}: {
  /** The member may see contact phones; the phone-only filter is hidden otherwise. */
  canViewPhones: boolean
  onOpenChange: (open: boolean) => void
  posts: ManagedPost[]
  /** Trial-expired workspace: the server refuses a like (a mutation); a delete stays open. */
  readOnly: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const open = posts.length > 0
  const [searchText, setSearchText] = useState("")
  const [phoneOnly, setPhoneOnly] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const single = posts.length === 1 ? posts[0] : undefined
  const postsById = useMemo(
    () => new Map(posts.map((post) => [post.id, post])),
    [posts],
  )
  const captions = useMemo(
    () =>
      new Map(posts.map((post) => [post.id, post.caption ?? post.inboxName])),
    [posts],
  )

  const search = useDebouncedValue(searchText.trim(), SEARCH_DEBOUNCE_MS)

  const baseInput = {
    limit: COMMENTS_PAGE_SIZE,
    search: search || undefined,
    workspaceId,
  }
  const getNextPageParam = (page: { nextCursor?: CommentsCursor }) =>
    page.nextCursor ?? undefined
  const singleComments = useInfiniteQuery(
    orpc.channelPostManagementAPIs.privateListChannelPostCommentsAPI.infiniteOptions(
      {
        enabled: Boolean(single),
        getNextPageParam,
        initialPageParam: undefined as CommentsCursor | undefined,
        input: (cursor: CommentsCursor | undefined) => ({
          ...baseInput,
          cursor,
          hasPhone: phoneOnly ? "true" : undefined,
          id: single?.id ?? "",
        }),
      },
    ),
  )
  const mergedComments = useInfiniteQuery(
    orpc.channelPostManagementAPIs.privateMergeChannelPostCommentsAPI.infiniteOptions(
      {
        enabled: posts.length > 1,
        getNextPageParam,
        initialPageParam: undefined as CommentsCursor | undefined,
        input: (cursor: CommentsCursor | undefined) => ({
          ...baseInput,
          cursor,
          hasPhone: phoneOnly || undefined,
          postIds: posts.map((post) => post.id),
        }),
      },
    ),
  )
  const comments = single ? singleComments : mergedComments
  const items = useMemo(
    () =>
      [...(comments.data?.pages.flatMap((page) => page.items) ?? [])].reverse(),
    [comments.data],
  )

  // Land on the newest comment when the first page arrives.
  const firstPageLoaded = comments.data?.pages.length === 1
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll once per first page
  useEffect(() => {
    if (firstPageLoaded) {
      bottomRef.current?.scrollIntoView({ block: "end" })
    }
  }, [firstPageLoaded, items.length === 0])

  const invalidateComments = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey:
          orpc.channelPostManagementAPIs.privateListChannelPostCommentsAPI.key(),
      }),
      queryClient.invalidateQueries({
        queryKey:
          orpc.channelPostManagementAPIs.privateMergeChannelPostCommentsAPI.key(),
      }),
    ])
  // A deleted comment also changes the post's comment count in the list.
  const invalidateAfterDelete = () =>
    Promise.all([
      invalidateComments(),
      queryClient.invalidateQueries({
        queryKey:
          orpc.channelPostManagementAPIs.privateListManagedChannelPostsAPI.key(),
      }),
    ])
  // The worker stores `liked` after the like is sent, so refetching right away
  // would show the old state: the cached pages are updated at once and put back
  // if the request fails.
  const commentQueryKeys = () => [
    orpc.channelPostManagementAPIs.privateListChannelPostCommentsAPI.key(),
    orpc.channelPostManagementAPIs.privateMergeChannelPostCommentsAPI.key(),
  ]
  const like = useMutation(
    orpc.channelPostManagementAPIs.privateLikeChannelPostCommentAPI.mutationOptions(
      {
        onError: (error, _variables, context) => {
          const { snapshot } = (context ?? { snapshot: [] }) as LikeContext
          for (const [key, data] of snapshot) {
            queryClient.setQueryData(key, data)
          }
          toast.error(error.message)
        },
        onMutate: async (variables) => {
          // An in-flight refetch would land after the write and bring back the old flag.
          await Promise.all(
            commentQueryKeys().map((queryKey) =>
              queryClient.cancelQueries({ queryKey }),
            ),
          )
          const snapshot = commentQueryKeys().flatMap((queryKey) =>
            queryClient.getQueriesData({ queryKey }),
          )
          for (const queryKey of commentQueryKeys()) {
            queryClient.setQueriesData<CommentsCache>({ queryKey }, (data) =>
              withCommentLiked(data, variables.commentId, variables.liked),
            )
          }
          return { snapshot }
        },
      },
    ),
  )
  const remove = useMutation(
    orpc.channelPostManagementAPIs.privateDeleteChannelPostCommentAPI.mutationOptions(
      {
        onError: (error) => toast.error(error.message),
        onSuccess: invalidateAfterDelete,
      },
    ),
  )

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setSearchText("")
          setPhoneOnly(false)
        }
        onOpenChange(next)
      }}
      open={open}
    >
      <DialogContent className="flex h-[85vh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {single
              ? t("posts.comments.title")
              : t("posts.comments.mergedTitle", { count: posts.length })}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <SearchIcon className="absolute start-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="ps-9"
              onChange={(event) => setSearchText(event.target.value)}
              placeholder={t("posts.comments.searchPlaceholder")}
              value={searchText}
            />
          </div>
          {canViewPhones ? (
            <Button
              aria-pressed={phoneOnly}
              onClick={() => setPhoneOnly((value) => !value)}
              size="sm"
              variant={phoneOnly ? "secondary" : "outline"}
            >
              <PhoneIcon />
              {t("posts.comments.phoneOnly")}
            </Button>
          ) : null}
          {single?.permalink ? (
            <Button
              nativeButton={false}
              render={
                // biome-ignore lint/a11y/useAnchorContent: the button supplies the label
                <a
                  href={single.permalink}
                  rel="noopener noreferrer"
                  target="_blank"
                />
              }
              size="sm"
              variant="outline"
            >
              {t("posts.actions.viewOriginal")}
            </Button>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg bg-muted/60 p-3">
          {comments.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                disabled={comments.isFetchingNextPage}
                onClick={() => comments.fetchNextPage()}
                size="sm"
                variant="ghost"
              >
                {comments.isFetchingNextPage ? (
                  <Loader2Icon className="animate-spin" />
                ) : null}
                {t("posts.comments.loadOlder")}
              </Button>
            </div>
          ) : null}
          {comments.isPending ? (
            <div className="flex justify-center p-6">
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {comments.isError ? (
            <div className="flex items-center justify-center gap-2 p-4 text-destructive text-sm">
              {comments.error.message}
              <Button
                onClick={() => comments.refetch()}
                size="sm"
                variant="ghost"
              >
                {t("actions.retry")}
              </Button>
            </div>
          ) : null}
          {comments.isSuccess && items.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground text-sm">
              {t("posts.comments.empty")}
            </p>
          ) : null}
          {items.map((comment) => {
            const capability = capabilityOfChannel(
              postsById.get(comment.postId)?.channel ?? "",
            )
            return (
              <CommentBubble
                canDelete={capability?.commentDelete === true}
                canLike={capability?.commentLike === true}
                channel={postsById.get(comment.postId)?.channel ?? ""}
                comment={comment}
                key={comment.id}
                likeDisabled={readOnly}
                onDelete={(target) =>
                  remove.mutate({
                    commentId: target.id,
                    createdAt: target.createdAt,
                    id: target.postId,
                    workspaceId,
                  })
                }
                onLike={(target) =>
                  like.mutate({
                    commentId: target.id,
                    createdAt: target.createdAt,
                    id: target.postId,
                    liked: !target.liked,
                    workspaceId,
                  })
                }
                postCaption={
                  single ? null : (captions.get(comment.postId) ?? null)
                }
              />
            )
          })}
          <div ref={bottomRef} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
