"use client"

import { AI_HANDOVER_BULK_LIVE_STATUSES } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
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
import { useQuery } from "@tanstack/react-query"
import { ChevronLeftIcon, ChevronRightIcon, HistoryIcon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { orpc } from "@/lib/orpc/query"
import { bulkStatusCopy, bulkToneClassName } from "../lib/bulk-run-resource"
import type { AiHandoverBulkRunResource } from "../schema/bulk"

const DATE_TIME_FORMAT = { dateStyle: "short", timeStyle: "short" } as const
const PER_PAGE = 10
const POLL_INTERVAL_MS = 5000
const MESSAGE_PREVIEW_LENGTH = 60
const SKELETON_ROW_KEYS = ["first", "second", "third"] as const

const EMPTY_CELL = <span className="text-muted-foreground">—</span>

function DateCell({ date }: { date: Date | null }) {
  const formatter = useFormatter()
  if (!date) {
    return EMPTY_CELL
  }
  return formatter.dateTime(date, DATE_TIME_FORMAT)
}

function StatusCell({ run }: { run: AiHandoverBulkRunResource }) {
  const t = useTranslations()
  const formatter = useFormatter()
  const copy = bulkStatusCopy[run.status]
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          "w-fit rounded-full px-2 py-0.5 font-medium text-xs",
          bulkToneClassName[copy.tone],
        )}
      >
        {t(copy.key)}
      </span>
      {run.pausedUntil && (
        <span className="text-amber-600 text-xs dark:text-amber-400">
          {t("aiHandover.bulk.pausedUntil", {
            at: formatter.dateTime(run.pausedUntil, DATE_TIME_FORMAT),
          })}
        </span>
      )}
      {run.currentError && (
        <span className="text-destructive text-xs">
          {t(`aiHandover.bulk.runErrors.${run.currentError}`)}
        </span>
      )}
    </div>
  )
}

function MessageCell({ message }: { message: string | null }) {
  if (!message) {
    return EMPTY_CELL
  }
  const preview =
    message.length > MESSAGE_PREVIEW_LENGTH
      ? `${message.slice(0, MESSAGE_PREVIEW_LENGTH)}…`
      : message
  return <span title={message}>{preview}</span>
}

function HistoryTable({ runs }: { runs: AiHandoverBulkRunResource[] }) {
  const t = useTranslations()
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("aiHandover.history.columns.action")}</TableHead>
          <TableHead>{t("aiHandover.history.columns.requestedAt")}</TableHead>
          <TableHead>{t("fields.status.label")}</TableHead>
          <TableHead>{t("aiHandover.history.columns.progress")}</TableHead>
          <TableHead>{t("aiHandover.history.columns.finishedAt")}</TableHead>
          <TableHead>{t("aiHandover.history.columns.message")}</TableHead>
          <TableHead>{t("aiHandover.history.columns.requestedBy")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => {
          const done = run.processedCount + run.skippedCount + run.failedCount
          return (
            <TableRow key={run.id}>
              <TableCell>{t(`aiHandover.bulk.action.${run.action}`)}</TableCell>
              <TableCell>
                <DateCell date={run.requestedAt} />
              </TableCell>
              <TableCell>
                <StatusCell run={run} />
              </TableCell>
              <TableCell className="tabular-nums">
                <div className="flex flex-col">
                  <span>
                    {t("aiHandover.bulk.processedOfTotal", {
                      done,
                      total: run.totalCount ?? done,
                    })}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t("aiHandover.bulk.counters", {
                      processed: run.processedCount,
                      skipped: run.skippedCount,
                      failed: run.failedCount,
                    })}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <DateCell date={run.finishedAt} />
              </TableCell>
              <TableCell>
                <MessageCell message={run.message} />
              </TableCell>
              <TableCell>{run.requestedByName ?? EMPTY_CELL}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

type HistoryDialogProps = {
  workspaceId: string
  inboxId: string
  /** The Page has a run in progress: its row refreshes while the dialog is open. */
  isRunLive: boolean
}

/**
 * The Page's "apply to all" run history, opened from the card without leaving
 * the page. Loaded only while open, newest first, ten per page, refreshed every
 * five seconds while a run is live.
 */
export function AiHandoverHistoryDialog(props: HistoryDialogProps) {
  const { workspaceId, inboxId, isRunLive } = props
  const t = useTranslations()
  const [isOpen, setIsOpen] = useState(false)
  const [page, setPage] = useState(1)

  const { data, isPending, isError, refetch } = useQuery(
    orpc.aiHandoverAPIs.listBulkHistory.queryOptions({
      input: { workspaceId, inboxId, page, perPage: PER_PAGE },
      enabled: isOpen,
      // Its own rows decide too: the status query may settle (or have no run
      // yet, while a change waits) before this list shows the final state.
      refetchInterval: (query) =>
        isRunLive ||
        query.state.data?.data.some((run) =>
          AI_HANDOVER_BULK_LIVE_STATUSES.includes(run.status),
        )
          ? POLL_INTERVAL_MS
          : false,
    }),
  )

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (!open) {
      setPage(1)
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={isOpen}>
      <DialogTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <HistoryIcon aria-hidden className="size-4" />
            {t("aiHandover.history.link")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("aiHandover.history.title")}</DialogTitle>
          <DialogDescription>
            {t("aiHandover.history.description")}
          </DialogDescription>
        </DialogHeader>

        {isPending && (
          <div className="flex flex-col gap-2" role="status">
            {SKELETON_ROW_KEYS.map((key) => (
              <Skeleton className="h-10 w-full" key={key} />
            ))}
          </div>
        )}
        {isError && (
          <div className="flex flex-col items-start gap-2" role="alert">
            <p className="text-destructive text-sm">
              {t("aiHandover.history.error")}
            </p>
            <Button
              onClick={() => refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("actions.retry")}
            </Button>
          </div>
        )}
        {data && data.data.length === 0 && (
          <p className="text-muted-foreground text-sm">
            {t("aiHandover.history.empty")}
          </p>
        )}
        {data && data.data.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto">
              <HistoryTable runs={data.data} />
            </div>
            {data.pageCount > 1 && (
              <div className="flex items-center justify-end gap-2">
                <span className="text-muted-foreground text-sm tabular-nums">
                  {page} / {data.pageCount}
                </span>
                <Button
                  aria-label={t("aiHandover.history.previousPage")}
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <ChevronLeftIcon aria-hidden />
                </Button>
                <Button
                  aria-label={t("aiHandover.history.nextPage")}
                  disabled={page >= data.pageCount}
                  onClick={() => setPage((current) => current + 1)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <ChevronRightIcon aria-hidden />
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
