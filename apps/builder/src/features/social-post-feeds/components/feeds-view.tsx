"use client"

import type { SocialPostFeedStatus } from "@chatbotx.io/database/partials"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  AlertTriangleIcon,
  EllipsisVerticalIcon,
  ListIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  RssIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useQueryStates } from "nuqs"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { z } from "zod"
import { usePublishDestinations } from "@/features/social-posts/hooks/use-publish-destinations"
import { flattenDestinations } from "@/features/social-posts/lib/publish-destination-options"
import { orpc } from "@/lib/orpc/query"
import { feedFilterParsers } from "../lib/feed-filters"
import { knownFeedErrorCode } from "../lib/feed-options"
import {
  FEED_RUN_MESSAGES,
  type FeedRunLine,
  feedRunLines,
} from "../lib/feed-run-summary"
import { useFeedErrorMessage } from "../lib/use-feed-error-message"
import type { postFeedResource } from "../schema"
import { FeedDestinationsDialog } from "./feed-destinations-dialog"
import { FeedFilterBar } from "./feed-filter-bar"
import { FeedFormDialog } from "./feed-form-dialog"
import { FeedItemsDialog } from "./feed-items-dialog"

type Feed = z.infer<typeof postFeedResource>

const DestinationsButton = ({
  count,
  onClick,
}: {
  count: number
  onClick: () => void
}) => {
  const t = useTranslations()
  return (
    <button
      className="rounded underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
      type="button"
    >
      {t("posts.feeds.destinations", { count })}
    </button>
  )
}

const STATUS_TONES: Record<SocialPostFeedStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  error: "bg-destructive/15 text-destructive",
  paused: "bg-muted text-muted-foreground",
}

const FeedRow = ({
  feed,
  onEdit,
  onSelectedChange,
  onShowDestinations,
  onShowItems,
  readOnly,
  selected,
  workspaceId,
}: {
  feed: Feed
  onEdit: () => void
  onSelectedChange: (selected: boolean) => void
  onShowDestinations: () => void
  onShowItems: () => void
  readOnly: boolean
  selected: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const format = useFormatter()
  const queryClient = useQueryClient()
  const errorMessage = useFeedErrorMessage()
  const [confirming, setConfirming] = useState(false)
  const [confirmTest, setConfirmTest] = useState(false)
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.postFeedsAPIs.privateListPostFeedsAPI.key(),
    })
  const onError = (error: Error) => toast.error(errorMessage(error))
  const done = (message: string) => async () => {
    toast.success(message)
    await refresh()
  }
  const key = { id: feed.id, workspaceId }
  const check = useMutation(
    orpc.postFeedsAPIs.privateCheckPostFeedAPI.mutationOptions({
      onError,
      onSuccess: done(t("posts.feeds.toast.checkStarted")),
    }),
  )
  const pause = useMutation(
    orpc.postFeedsAPIs.privatePausePostFeedAPI.mutationOptions({
      onError,
      onSuccess: done(t("posts.feeds.toast.paused")),
    }),
  )
  const sendTest = useMutation(
    orpc.postFeedsAPIs.privateSendPostFeedTestAPI.mutationOptions({
      onError,
      onSettled: () => setConfirmTest(false),
      onSuccess: (result) =>
        toast.success(t("posts.feeds.toast.testDraftCreated"), {
          action: {
            label: t("posts.feeds.toast.openDraft"),
            onClick: () => {
              window.location.assign(
                `/space/${workspaceId}/posts/${result.socialPostId}/edit`,
              )
            },
          },
          description:
            result.note === "aiFallback"
              ? t("posts.feeds.toast.testUsedTemplate")
              : undefined,
        }),
    }),
  )
  const resume = useMutation(
    orpc.postFeedsAPIs.privateResumePostFeedAPI.mutationOptions({
      onError,
      onSuccess: done(t("posts.feeds.toast.resumed")),
    }),
  )
  const remove = useMutation(
    orpc.postFeedsAPIs.privateDeletePostFeedAPI.mutationOptions({
      onError,
      onSuccess: done(t("posts.feeds.toast.deleted")),
    }),
  )
  const busy =
    check.isPending ||
    sendTest.isPending ||
    pause.isPending ||
    resume.isPending ||
    remove.isPending
  const errorCode = knownFeedErrorCode(feed.lastErrorCode)
  const runLines = feedRunLines(feed.lastRunSummary)
  const runLineText = (line: FeedRunLine): string => {
    if (line.key !== "dailyCap") {
      return t(FEED_RUN_MESSAGES[line.key], { count: line.count ?? 0 })
    }
    const counts = { cap: line.cap ?? 0, count: line.count ?? 0 }
    if (!line.until) {
      return t(FEED_RUN_MESSAGES.dailyCap, counts)
    }
    return t(FEED_RUN_MESSAGES.dailyCapUntil, {
      ...counts,
      until: format.dateTime(new Date(line.until), {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    })
  }

  return (
    <>
      <TableRow data-state={selected ? "selected" : undefined}>
        {readOnly ? null : (
          <TableCell className="w-10">
            <Checkbox
              aria-label={t("posts.feeds.bulkDelete.selectFeed", {
                name: feed.name,
              })}
              checked={selected}
              onCheckedChange={(checked) => onSelectedChange(checked === true)}
            />
          </TableCell>
        )}
        <TableCell className="min-w-40 max-w-[18rem]">
          <button
            className="block max-w-full truncate text-start font-semibold hover:underline disabled:no-underline"
            disabled={readOnly}
            onClick={onEdit}
            type="button"
          >
            {feed.name}
          </button>
          <p
            className="truncate text-muted-foreground text-xs"
            title={feed.feedUrl}
          >
            {feed.feedUrl}
          </p>
          <p className="mt-1 text-muted-foreground text-xs md:hidden">
            {t("posts.feeds.every", { minutes: feed.intervalMinutes })} ·{" "}
            <DestinationsButton
              count={feed.destinationIds.length}
              onClick={onShowDestinations}
            />
          </p>
        </TableCell>
        <TableCell className="min-w-28">
          <Badge className={cn("border-0", STATUS_TONES[feed.status])}>
            {t(`posts.feeds.status.${feed.status}`)}
          </Badge>
          {errorCode ? (
            <p
              className="mt-1 flex items-start gap-1 text-destructive text-xs"
              role="alert"
            >
              <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
              {t(`posts.feeds.error.${errorCode}`)}
            </p>
          ) : null}
          {runLines.some((line) => line.key === "stale") ? (
            <p className="mt-1 max-w-56 text-muted-foreground text-xs">
              {t(FEED_RUN_MESSAGES.stale)}
            </p>
          ) : null}
          {feed.primed ? null : (
            <p className="mt-1 max-w-56 text-muted-foreground text-xs">
              {t("posts.feeds.firstCheckPending")}
            </p>
          )}
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          <Badge variant="outline">{t(`posts.feeds.mode.${feed.mode}`)}</Badge>
        </TableCell>
        <TableCell className="hidden whitespace-nowrap md:table-cell">
          {t("posts.feeds.every", { minutes: feed.intervalMinutes })}
        </TableCell>
        <TableCell className="hidden whitespace-nowrap md:table-cell">
          <DestinationsButton
            count={feed.destinationIds.length}
            onClick={onShowDestinations}
          />
        </TableCell>
        <TableCell className="hidden whitespace-nowrap text-muted-foreground xl:table-cell">
          {feed.lastCheckedAt
            ? format.dateTime(feed.lastCheckedAt, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : t("posts.feeds.neverChecked")}
          {runLines.map((line) => (
            <p className="text-xs" key={line.key}>
              {runLineText(line)}
            </p>
          ))}
        </TableCell>
        <TableCell className="sticky end-0 w-10 bg-card text-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label={t("actions.openMenu")}
                  className="size-8"
                  size="icon"
                  variant="ghost"
                >
                  <EllipsisVerticalIcon className="size-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={readOnly || busy || feed.status !== "active"}
                onClick={() => check.mutate(key)}
              >
                <RefreshCwIcon />
                {t("posts.feeds.actions.checkNow")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={readOnly || busy}
                onClick={() => setConfirmTest(true)}
              >
                <SendIcon />
                {t("posts.feeds.actions.sendTest")}
              </DropdownMenuItem>
              {feed.status === "active" ? (
                <DropdownMenuItem
                  disabled={busy}
                  onClick={() => pause.mutate(key)}
                >
                  <PauseIcon />
                  {t("posts.feeds.actions.pause")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  disabled={readOnly || busy}
                  onClick={() => resume.mutate(key)}
                >
                  <PlayIcon />
                  {t("posts.feeds.actions.resume")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem disabled={readOnly} onClick={onEdit}>
                <PencilIcon />
                {t("posts.feeds.actions.edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShowItems}>
                <ListIcon />
                {t("posts.feeds.actions.items")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={busy}
                onClick={() => setConfirming(true)}
                variant="destructive"
              >
                <Trash2Icon />
                {t("posts.feeds.actions.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
      <AlertDialog onOpenChange={setConfirming} open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("posts.feeds.deleteConfirmTitle", { name: feed.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("posts.feeds.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <Button
              disabled={remove.isPending}
              onClick={() => remove.mutate(key)}
              variant="destructive"
            >
              {t("posts.feeds.actions.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog onOpenChange={setConfirmTest} open={confirmTest}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("posts.feeds.sendTestConfirm.title")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("posts.feeds.sendTestConfirm.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <Button
              disabled={sendTest.isPending}
              onClick={() => sendTest.mutate(key)}
            >
              <SendIcon />
              {t("posts.feeds.actions.sendTest")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** The Feeds tab: the workspace's RSS/Atom feeds, their state, and the dialogs that edit them. */
export const FeedsView = ({
  readOnly,
  workspaceId,
}: {
  readOnly: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const errorMessage = useFeedErrorMessage()
  const [query, setQuery] = useQueryStates(feedFilterParsers)
  const filters = useMemo(
    () => ({
      destinationIds: query.feedDestinations ?? [],
      mode: query.feedMode,
      search: query.feedQ ?? "",
      status: query.feedStatus,
    }),
    [query],
  )
  const hasFilters =
    filters.search !== "" ||
    filters.status !== null ||
    filters.mode !== null ||
    filters.destinationIds.length > 0
  const feeds = useQuery(
    orpc.postFeedsAPIs.privateListPostFeedsAPI.queryOptions({
      input: {
        destinationIds:
          filters.destinationIds.length > 0
            ? [...filters.destinationIds]
            : undefined,
        mode: filters.mode ? [filters.mode] : undefined,
        search: filters.search || undefined,
        status: filters.status ? [filters.status] : undefined,
        workspaceId,
      },
      placeholderData: keepPreviousData,
    }),
  )
  const destinationList = usePublishDestinations(workspaceId)
  const destinationOptions = useMemo(
    () => flattenDestinations(destinationList.data?.items ?? []),
    [destinationList.data],
  )
  const destinationMap = useMemo(
    () => new Map(destinationOptions.map((option) => [option.id, option])),
    [destinationOptions],
  )
  const [destinationsOf, setDestinationsOf] = useState<Feed | null>(null)
  const [editing, setEditing] = useState<Feed | "new" | null>(null)
  const [itemsOf, setItemsOf] = useState<Feed | null>(null)
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set())
  const [confirmingBulk, setConfirmingBulk] = useState(false)
  const rows = feeds.data?.items ?? []
  const hasFeeds = rows.length > 0
  const filterKey = JSON.stringify(filters)
  // Bulk actions only reach what is on screen: a filter change drops the selection.
  // biome-ignore lint/correctness/useExhaustiveDependencies: filterKey is the trigger
  useEffect(() => setSelection(new Set()), [filterKey])
  const clearFilters = useCallback(
    () =>
      setQuery({
        feedDestinations: null,
        feedMode: null,
        feedQ: null,
        feedStatus: null,
      }),
    [setQuery],
  )
  const setSearch = useCallback(
    (search: string) => setQuery({ feedQ: search === "" ? null : search }),
    [setQuery],
  )
  // Only feeds still listed count: one removed elsewhere drops out by itself.
  const selectedIds = rows
    .map((feed) => feed.id)
    .filter((id) => selection.has(id))
  const allSelected = hasFeeds && selectedIds.length === rows.length
  const bulkDelete = useMutation(
    orpc.postFeedsAPIs.privateBulkDeletePostFeedsAPI.mutationOptions({
      onError: (error: Error) => toast.error(errorMessage(error)),
      onSettled: () => setConfirmingBulk(false),
      onSuccess: async (result) => {
        toast.success(
          t("posts.feeds.bulkDelete.success", {
            count: result.deletedIds.length,
          }),
        )
        setSelection(new Set())
        await queryClient.invalidateQueries({
          queryKey: orpc.postFeedsAPIs.privateListPostFeedsAPI.key(),
        })
      },
    }),
  )
  const toggleOne = (id: string, selected: boolean) =>
    setSelection((current) => {
      const next = new Set(current)
      if (selected) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })

  return (
    <section aria-labelledby="feeds-heading" className="space-y-4">
      <header className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-5">
        <div className="me-auto">
          <h1 className="font-semibold text-lg" id="feeds-heading">
            {t("posts.feeds.title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("posts.feeds.description")}
          </p>
        </div>
        {hasFeeds || hasFilters ? (
          <Button
            disabled={readOnly}
            onClick={() => setEditing("new")}
            size="sm"
          >
            <PlusIcon />
            {t("posts.feeds.add")}
          </Button>
        ) : null}
      </header>
      {hasFeeds || hasFilters ? (
        <FeedFilterBar
          destinations={destinationOptions}
          filters={filters}
          hasFilters={hasFilters}
          onClear={clearFilters}
          onDestinationsChange={(ids) =>
            setQuery({ feedDestinations: ids.length > 0 ? ids : null })
          }
          onModeChange={(mode) => setQuery({ feedMode: mode })}
          onSearchChange={setSearch}
          onStatusChange={(status) => setQuery({ feedStatus: status })}
        />
      ) : null}
      {selectedIds.length > 0 && !readOnly ? (
        <div className="flex items-center gap-3 px-1">
          <Button
            disabled={bulkDelete.isPending}
            onClick={() => setConfirmingBulk(true)}
            size="sm"
            variant="outline"
          >
            <Trash2Icon />
            {t("posts.feeds.bulkDelete.deleteSelected", {
              count: selectedIds.length,
            })}
          </Button>
        </div>
      ) : null}
      {feeds.isLoading ? <Skeleton className="h-28 w-full" /> : null}
      {feeds.isError ? (
        <div
          className="flex items-center justify-center gap-2 rounded-xl border bg-card p-6 text-destructive text-sm"
          role="alert"
        >
          {t("messages.errorLoadingData")}
          <Button onClick={() => feeds.refetch()} size="sm" variant="ghost">
            {t("actions.retry")}
          </Button>
        </div>
      ) : null}
      {feeds.isSuccess && !hasFeeds && !hasFilters ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <RssIcon className="size-5" />
          </span>
          <p className="max-w-md text-muted-foreground text-sm">
            {t("posts.feeds.empty")}
          </p>
          <Button
            disabled={readOnly}
            onClick={() => setEditing("new")}
            size="sm"
          >
            <PlusIcon />
            {t("posts.feeds.add")}
          </Button>
        </div>
      ) : null}
      {hasFeeds || (hasFilters && feeds.isSuccess) ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {readOnly ? null : (
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label={t("posts.feeds.bulkDelete.selectAll")}
                      checked={allSelected}
                      indeterminate={selectedIds.length > 0 && !allSelected}
                      onCheckedChange={(checked) =>
                        setSelection(
                          checked === true
                            ? new Set(rows.map((feed) => feed.id))
                            : new Set(),
                        )
                      }
                    />
                  </TableHead>
                )}
                <TableHead>{t("posts.feeds.columns.name")}</TableHead>
                <TableHead>{t("posts.feeds.columns.status")}</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("posts.feeds.columns.mode")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("posts.feeds.columns.schedule")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("posts.feeds.columns.destinations")}
                </TableHead>
                <TableHead className="hidden xl:table-cell">
                  {t("posts.feeds.columns.lastChecked")}
                </TableHead>
                <TableHead className="sticky end-0 w-10 bg-card">
                  <span className="sr-only">{t("actions.openMenu")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hasFeeds ? null : (
                <TableRow>
                  <TableCell
                    className="py-10 text-center"
                    colSpan={readOnly ? 7 : 8}
                  >
                    <p className="text-muted-foreground text-sm">
                      {t("posts.feeds.filters.noMatch")}
                    </p>
                    <Button
                      className="mt-3"
                      onClick={clearFilters}
                      size="sm"
                      variant="outline"
                    >
                      {t("posts.feeds.filters.clear")}
                    </Button>
                  </TableCell>
                </TableRow>
              )}
              {rows.map((feed) => (
                <FeedRow
                  feed={feed}
                  key={feed.id}
                  onEdit={() => setEditing(feed)}
                  onSelectedChange={(selected) => toggleOne(feed.id, selected)}
                  onShowDestinations={() => setDestinationsOf(feed)}
                  onShowItems={() => setItemsOf(feed)}
                  readOnly={readOnly}
                  selected={selection.has(feed.id)}
                  workspaceId={workspaceId}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <AlertDialog onOpenChange={setConfirmingBulk} open={confirmingBulk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("posts.feeds.bulkDelete.confirmTitle", {
                count: selectedIds.length,
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("posts.feeds.bulkDelete.confirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <Button
              disabled={bulkDelete.isPending}
              onClick={() =>
                bulkDelete.mutate({ ids: selectedIds, workspaceId })
              }
              variant="destructive"
            >
              {t("posts.feeds.actions.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {editing ? (
        <FeedFormDialog
          feed={editing === "new" ? null : editing}
          key={editing === "new" ? "new" : editing.id}
          onOpenChange={(open) => !open && setEditing(null)}
          open
          workspaceId={workspaceId}
        />
      ) : null}
      <FeedDestinationsDialog
        canEdit={!readOnly}
        destinationIds={destinationsOf?.destinationIds ?? []}
        destinations={destinationMap}
        feedName={destinationsOf?.name ?? ""}
        onEdit={() => destinationsOf && setEditing(destinationsOf)}
        onOpenChange={(open) => !open && setDestinationsOf(null)}
        open={destinationsOf !== null}
      />
      <FeedItemsDialog
        feedId={itemsOf?.id ?? null}
        feedName={itemsOf?.name ?? ""}
        onOpenChange={(open) => !open && setItemsOf(null)}
        workspaceId={workspaceId}
      />
    </section>
  )
}
