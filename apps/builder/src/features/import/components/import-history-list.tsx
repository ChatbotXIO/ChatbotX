"use client"

import type { ImportStatus } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Progress } from "@chatbotx.io/ui/components/ui/progress"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { format } from "date-fns"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { use, useEffect } from "react"
import type { listImports } from "../queries/list-imports.queries"
import type { ListImportsItem } from "../schemas/query"

type ImportHistoryListProps = {
  promises: Promise<[Awaited<ReturnType<typeof listImports>>]>
  limit?: number
}

const POLL_INTERVAL_MS = 5000
const DEFAULT_LIMIT = 5

const STATUS_STYLES: Record<ImportStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-destructive/15 text-destructive",
}

const isRunning = (status: ImportStatus) =>
  status === "pending" || status === "processing"

function ImportErrorSampleButton({ item }: { item: ListImportsItem }) {
  const t = useTranslations()

  if (item.errorSample.length === 0) {
    return (
      <span className="text-destructive tabular-nums">{item.failedCount}</span>
    )
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            className="h-auto p-0 text-destructive tabular-nums"
            variant="link"
          >
            {item.failedCount}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("fields.import.histories.errorDetails")}</DialogTitle>
        </DialogHeader>
        <div className="max-h-96 space-y-2 overflow-auto">
          {item.errorSample.map((error) => (
            <div
              className="grid grid-cols-[5rem_1fr] gap-2 rounded-md border p-2 text-sm"
              key={`${error.row}-${error.reason}`}
            >
              <span className="font-medium">
                {t("fields.import.histories.row", { row: error.row })}
              </span>
              <span className="text-muted-foreground">{error.reason}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ImportHistoryRow({ item }: { item: ListImportsItem }) {
  const t = useTranslations()
  const statusKey = `fields.status.${item.status}` as const
  const percent =
    item.totalCount > 0
      ? Math.min(100, Math.round((item.processedCount / item.totalCount) * 100))
      : 0

  return (
    <li className="rounded-lg border bg-card px-3 py-2.5 transition-colors hover:border-border/80 hover:bg-accent/40">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 truncate font-medium text-sm">
          {item.fileName}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 font-medium text-xs",
            STATUS_STYLES[item.status],
          )}
        >
          {t.has(statusKey) ? t(statusKey) : item.status}
        </span>
      </div>

      {isRunning(item.status) && item.totalCount > 0 ? (
        <Progress className="mt-2 h-1" value={percent} />
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
        <time dateTime={item.createdAt.toISOString()}>
          {format(item.createdAt, "yyyy/MM/dd HH:mm")}
        </time>
        {item.totalCount > 0 ? (
          <span className="tabular-nums">
            {item.processedCount} / {item.totalCount}
          </span>
        ) : null}
        <span className="flex items-center gap-1">
          {t("fields.import.histories.success")}
          <span className="text-emerald-700 tabular-nums dark:text-emerald-300">
            {item.successCount}
          </span>
        </span>
        <span className="flex items-center gap-1">
          {t("fields.import.histories.failed")}
          <ImportErrorSampleButton item={item} />
        </span>
      </div>

      {item.errorMessage ? (
        <p className="mt-1.5 text-destructive text-xs">{item.errorMessage}</p>
      ) : null}
    </li>
  )
}

export function ImportHistoryList({
  promises,
  limit = DEFAULT_LIMIT,
}: ImportHistoryListProps) {
  const t = useTranslations()
  const router = useRouter()
  const [{ data }] = use(promises)
  const items = data.slice(0, limit)
  const hasRunningImport = items.some((item) => isRunning(item.status))

  useEffect(() => {
    if (!hasRunningImport) {
      return
    }
    const interval = window.setInterval(
      () => router.refresh(),
      POLL_INTERVAL_MS,
    )
    return () => window.clearInterval(interval)
  }, [hasRunningImport, router])

  if (items.length === 0) {
    return null
  }

  return (
    <section className="space-y-2">
      <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {t("fields.import.histories.recent")}
      </h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <ImportHistoryRow item={item} key={item.id} />
        ))}
      </ul>
    </section>
  )
}
