"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useQuery } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import {
  DEFAULT_POLL_INTERVAL_MS,
  pollUntilSettled,
} from "@/lib/query/poll-until-settled"
import { cancelContactSyncAction } from "../actions/contact-sync.action"
import { useContactSyncLabels } from "../hooks/use-contact-sync-labels"
import { ContactSyncFollowUp } from "./contact-sync-follow-up"

const SETTLED_STATUSES = [
  "succeeded",
  "partial",
  "failed",
  "cancelled",
] as const

type PolledRun = {
  status: string
  items: {
    followUpCoexist: boolean
    followUpRunId: string | null
    followUpError: string | null
  }[]
}

const pollUntilRunSettled = pollUntilSettled<PolledRun>(SETTLED_STATUSES)

/** The history sync this item asks for has neither started nor been refused yet. */
const owesFollowUp = (item: PolledRun["items"][number]) =>
  item.followUpCoexist &&
  item.followUpRunId === null &&
  item.followUpError === null

/**
 * Polls until the run ended and every history sync it owes was handed off
 * (or refused): the handoff (and a retried one) settles after the run.
 */
const pollRun = (query: { state: { data?: PolledRun } }) => {
  if (query.state.data?.items.some(owesFollowUp)) {
    return DEFAULT_POLL_INTERVAL_MS
  }
  return pollUntilRunSettled(query)
}

const DATE_TIME_FORMAT_OPTIONS = {
  dateStyle: "medium",
  timeStyle: "short",
} as const

/**
 * Live progress of one run, per source, with a cancel while it is live.
 * `onSettled` (the sync dialog) adds a Done button once the run has ended.
 */
export function ContactSyncProgress({
  workspaceId,
  runId,
  onSettled,
}: {
  workspaceId: string
  runId: string
  onSettled?: () => void
}) {
  const t = useTranslations()
  const format = useFormatter()
  const labels = useContactSyncLabels()
  const runQuery = useQuery(
    orpc.contactSyncAPIs.getRun.queryOptions({
      input: { workspaceId, runId },
      refetchInterval: pollRun,
    }),
  )
  const cancel = useAction(
    cancelContactSyncAction.bind(null, workspaceId, runId),
    {
      onSuccess: () => runQuery.refetch(),
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("contactSync.errors.generic"))
      },
    },
  )

  if (runQuery.isPending) {
    return (
      <div className="flex justify-center py-8">
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (runQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-2 text-sm">
        <p className="text-destructive">{t("contactSync.errors.generic")}</p>
        <Button onClick={() => runQuery.refetch()} size="sm" variant="outline">
          {t("actions.retry")}
        </Button>
      </div>
    )
  }

  const run = runQuery.data
  const isLive = !(SETTLED_STATUSES as readonly string[]).includes(run.status)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {isLive && <Loader2Icon className="size-4 animate-spin" />}
        <span className="font-medium text-sm">
          {t("contactSync.progress.title")}
        </span>
        <Badge variant={isLive ? "secondary" : "outline"}>
          {labels.status(run.status)}
        </Badge>
      </div>
      <p className="text-muted-foreground text-xs">
        {/* A queued run has not started yet: show when it was requested. */}
        {run.startedAt
          ? t("contactSync.progress.started", {
              time: format.dateTime(run.startedAt, DATE_TIME_FORMAT_OPTIONS),
            })
          : t("contactSync.progress.requested", {
              time: format.dateTime(run.createdAt, DATE_TIME_FORMAT_OPTIONS),
            })}
        {run.finishedAt &&
          ` · ${t("contactSync.progress.finished", {
            time: format.dateTime(run.finishedAt, DATE_TIME_FORMAT_OPTIONS),
          })}`}
      </p>
      {run.currentError && run.status !== "cancelled" && (
        <p className="text-destructive text-sm">
          {labels.runError(run.currentError)}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {run.items.map((item) => (
          <li className="rounded-md border p-3 text-sm" key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="truncate font-medium">
                {item.sourceAccountName ?? t("contactSync.progress.source")}
              </span>
              <Badge variant="outline">{labels.status(item.status)}</Badge>
            </div>
            <p className="mt-1 text-muted-foreground">
              {t("contactSync.progress.counts", {
                created: item.createdCount,
                updated: item.updatedCount,
                skipped: item.skippedCount,
                failed: item.failedCount,
              })}
            </p>
            {item.skippedValueCount > 0 && (
              <p className="mt-1 text-amber-700 text-xs dark:text-amber-400">
                {t("contactSync.progress.skippedValues", {
                  count: item.skippedValueCount,
                })}
              </p>
            )}
            {item.currentError && (
              <p className="mt-1 text-destructive">
                {labels.runError(item.currentError)}
              </p>
            )}
            <ContactSyncFollowUp item={item} workspaceId={workspaceId} />
          </li>
        ))}
      </ul>

      <div className="flex justify-end gap-2">
        {isLive && (
          <Button
            disabled={cancel.isPending || run.status === "cancelling"}
            onClick={() => cancel.execute()}
            variant="outline"
          >
            {cancel.isPending && <Loader2Icon className="animate-spin" />}
            {t("contactSync.progress.cancel")}
          </Button>
        )}
        {!isLive && onSettled && (
          <Button onClick={onSettled}>{t("contactSync.progress.done")}</Button>
        )}
      </div>
    </div>
  )
}
