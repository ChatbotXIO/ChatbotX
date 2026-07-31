"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import {
  ArchiveIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { useCouponTopicStore } from "@/features/coupons/provider/coupon-topic-store-context"
import type { CouponTopicResource } from "@/features/coupons/schemas/resource"
import { client } from "@/lib/orpc/orpc"
import { TopicDialog } from "./topic-dialog"

type TopicListProps = {
  workspaceId: string
  archived: boolean
}

type TopicTransferAction = "archive" | "unarchive"

type TopicTransferConfirmation = {
  action: TopicTransferAction
  topics: CouponTopicResource[]
}

export function TopicList({ workspaceId, archived }: TopicListProps) {
  const t = useTranslations()
  const formatter = useFormatter()
  const [topics, setTopics] = useState<CouponTopicResource[]>([])
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const perPage = 50
  const [pageCount, setPageCount] = useState(1)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CouponTopicResource | null>(null)
  const [deletingTopic, setDeletingTopic] =
    useState<CouponTopicResource | null>(null)
  const [transferConfirmation, setTransferConfirmation] =
    useState<TopicTransferConfirmation | null>(null)
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(
    () => new Set(),
  )
  const refreshCouponTopicOptions = useCouponTopicStore(
    (state) => state.refresh,
  )

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await client.couponsAPI.listCouponTopicsAPI({
        workspaceId,
        archived,
        search: search || undefined,
        page,
        perPage,
      })
      setTopics(result.data)
      setPageCount(result.pageCount)
      setTotal(result.total)
      setSelectedTopicIds((current) => {
        const visibleIds = new Set(result.data.map((topic) => topic.id))
        return new Set([...current].filter((id) => visibleIds.has(id)))
      })
    } finally {
      setIsLoading(false)
    }
  }, [archived, page, search, workspaceId])

  useEffect(() => {
    load().catch((error) =>
      toast.error(error instanceof Error ? error.message : t("messages.error")),
    )
  }, [load, t])

  const runAction = async (
    topic: CouponTopicResource,
    action: "archive" | "unarchive" | "delete",
  ) => {
    try {
      if (action === "archive") {
        await client.couponsAPI.archiveCouponTopicAPI({
          workspaceId,
          topicId: topic.id,
        })
      } else if (action === "unarchive") {
        await client.couponsAPI.unarchiveCouponTopicAPI({
          workspaceId,
          topicId: topic.id,
        })
      } else {
        await client.couponsAPI.deleteCouponTopicAPI({
          workspaceId,
          topicId: topic.id,
        })
      }
      toast.success(t("coupons.messages.topicSaved"))
      await load()
      await refreshCouponTopicOptions(workspaceId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("messages.error"))
    }
  }

  const runTopicTransfer = async (
    transferTopics: CouponTopicResource[],
    action: TopicTransferAction,
  ) => {
    try {
      await Promise.all(
        transferTopics.map((topic) => {
          if (action === "archive") {
            return client.couponsAPI.archiveCouponTopicAPI({
              workspaceId,
              topicId: topic.id,
            })
          }
          return client.couponsAPI.unarchiveCouponTopicAPI({
            workspaceId,
            topicId: topic.id,
          })
        }),
      )
      setSelectedTopicIds((current) => {
        const transferredIds = new Set(transferTopics.map((topic) => topic.id))
        return new Set([...current].filter((id) => !transferredIds.has(id)))
      })
      toast.success(t("coupons.messages.topicSaved"))
      await load()
      await refreshCouponTopicOptions(workspaceId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("messages.error"))
    }
  }

  const selectedTopics = topics.filter((topic) =>
    selectedTopicIds.has(topic.id),
  )
  const selectedCount = selectedTopics.length
  const allPageRowsSelected =
    topics.length > 0 && selectedCount === topics.length
  const somePageRowsSelected = selectedCount > 0 && !allPageRowsSelected

  const toggleAllPageRows = (checked: boolean) => {
    setSelectedTopicIds(
      checked ? new Set(topics.map((topic) => topic.id)) : new Set(),
    )
  }

  const toggleTopic = (topicId: string, checked: boolean) => {
    setSelectedTopicIds((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(topicId)
      } else {
        next.delete(topicId)
      }
      return next
    })
  }

  const resetSearch = () => {
    setPage(1)
    setSearch("")
  }

  const runBulkAction = async (action: "archive" | "unarchive" | "delete") => {
    if (action === "archive" || action === "unarchive") {
      setTransferConfirmation({ action, topics: selectedTopics })
      return
    }

    try {
      await Promise.all(
        selectedTopics.map((topic) =>
          client.couponsAPI.deleteCouponTopicAPI({
            workspaceId,
            topicId: topic.id,
          }),
        ),
      )
      setSelectedTopicIds(new Set())
      toast.success(t("coupons.messages.topicSaved"))
      await load()
      await refreshCouponTopicOptions(workspaceId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("messages.error"))
    }
  }

  const handleTopicSaved = async () => {
    await load()
    await refreshCouponTopicOptions(workspaceId)
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-56"
          onChange={(event) => {
            setPage(1)
            setSearch(event.target.value)
          }}
          placeholder={t("actions.search")}
          value={search}
        />
        {search ? (
          <Button onClick={resetSearch} size="sm" variant="outline">
            <XIcon className="size-4" />
            {t("actions.reset")}
          </Button>
        ) : null}
        {selectedCount > 0 && !archived ? (
          <Button
            onClick={() => runBulkAction("archive")}
            size="sm"
            variant="outline"
          >
            <ArchiveIcon className="size-4" />
            {t("actions.archive")} ({selectedCount})
          </Button>
        ) : null}
        {selectedCount > 0 && archived ? (
          <>
            <Button
              onClick={() => runBulkAction("unarchive")}
              size="sm"
              variant="outline"
            >
              <RotateCcwIcon className="size-4" />
              {t("actions.restore")} ({selectedCount})
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button size="sm" variant="destructive">
                    <Trash2Icon className="size-4" />
                    {t("actions.delete")} ({selectedCount})
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("coupons.messages.deleteTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("coupons.messages.deleteConfirm")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => runBulkAction("delete")}>
                    {t("actions.delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : null}
        <Button
          className="ms-auto"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
          size="sm"
        >
          <PlusIcon className="size-4" />
          {t("coupons.topic.create")}
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label={t("actions.selectAll")}
                  checked={allPageRowsSelected}
                  indeterminate={somePageRowsSelected}
                  onCheckedChange={(value) => toggleAllPageRows(Boolean(value))}
                />
              </TableHead>
              <TableHead>{t("fields.name.label")}</TableHead>
              <TableHead className="text-center">
                {t("coupons.fields.couponCount")}
              </TableHead>
              <TableHead className="text-center">
                {t("coupons.fields.validity")}
              </TableHead>
              <TableHead className="w-32 text-center">
                {t("actions.actions")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topics.map((topic) => (
              <TableRow
                data-state={selectedTopicIds.has(topic.id) ? "selected" : ""}
                key={topic.id}
              >
                <TableCell>
                  <Checkbox
                    aria-label={t("actions.selectRow")}
                    checked={selectedTopicIds.has(topic.id)}
                    onCheckedChange={(value) =>
                      toggleTopic(topic.id, Boolean(value))
                    }
                  />
                </TableCell>
                <TableCell className="font-medium">{topic.name}</TableCell>
                <TableCell className="text-center">
                  {topic.couponCount ?? 0}
                </TableCell>
                <TableCell className="text-center">
                  {topic.expiresAt
                    ? formatter.dateTime(new Date(topic.expiresAt), {
                        dateStyle: "medium",
                      })
                    : t("coupons.fields.unlimited")}
                </TableCell>
                <TableCell className="text-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button size="icon" variant="ghost">
                          <MoreHorizontalIcon className="size-4" />
                          <span className="sr-only">
                            {t("actions.openMenu")}
                          </span>
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(topic)
                          setDialogOpen(true)
                        }}
                      >
                        <PencilIcon className="me-2 size-4" />
                        {t("actions.edit")}
                      </DropdownMenuItem>
                      {archived ? (
                        <>
                          <DropdownMenuItem
                            onClick={() =>
                              setTransferConfirmation({
                                action: "unarchive",
                                topics: [topic],
                              })
                            }
                          >
                            <RotateCcwIcon className="me-2 size-4" />
                            {t("actions.restore")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeletingTopic(topic)}
                          >
                            <Trash2Icon className="me-2 size-4" />
                            {t("actions.delete")}
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem
                          onClick={() =>
                            setTransferConfirmation({
                              action: "archive",
                              topics: [topic],
                            })
                          }
                        >
                          <ArchiveIcon className="me-2 size-4" />
                          {t("actions.archive")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {topics.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={5}
                >
                  {isLoading
                    ? t("actions.loading")
                    : t("coupons.messages.empty")}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm">
        <div className="text-muted-foreground">
          {t("analytics.total")}: {total.toLocaleString()}
        </div>
        {pageCount > 1 ? (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">
              {t("analytics.pagination.pageOf", { page, pageCount })}
            </span>
            <Button
              aria-label={t("analytics.pagination.previousPage")}
              disabled={page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              size="icon"
              variant="outline"
            >
              <ChevronLeftIcon className="size-4 rtl:rotate-180" />
            </Button>
            <Button
              aria-label={t("analytics.pagination.nextPage")}
              disabled={page >= pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
              size="icon"
              variant="outline"
            >
              <ChevronRightIcon className="size-4 rtl:rotate-180" />
            </Button>
          </div>
        ) : null}
      </div>
      <TopicDialog
        onOpenChange={setDialogOpen}
        onSaved={handleTopicSaved}
        open={dialogOpen}
        topic={editing}
        workspaceId={workspaceId}
      />
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setTransferConfirmation(null)
          }
        }}
        open={Boolean(transferConfirmation)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {transferConfirmation?.action === "archive"
                ? t("coupons.messages.archiveTitle")
                : t("coupons.messages.restoreTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {transferConfirmation
                ? t(
                    transferConfirmation.topics.length === 1
                      ? `coupons.messages.${transferConfirmation.action}Confirm`
                      : `coupons.messages.${transferConfirmation.action}BulkConfirm`,
                    {
                      count: transferConfirmation.topics.length,
                      name: transferConfirmation.topics[0]?.name,
                    },
                  )
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (transferConfirmation) {
                  runTopicTransfer(
                    transferConfirmation.topics,
                    transferConfirmation.action,
                  ).catch((error) =>
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : t("messages.error"),
                    ),
                  )
                }
                setTransferConfirmation(null)
              }}
            >
              {transferConfirmation?.action === "archive"
                ? t("actions.archive")
                : t("actions.restore")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeletingTopic(null)
          }
        }}
        open={Boolean(deletingTopic)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("coupons.messages.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("coupons.messages.deleteConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingTopic) {
                  runAction(deletingTopic, "delete")
                }
                setDeletingTopic(null)
              }}
            >
              {t("actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
