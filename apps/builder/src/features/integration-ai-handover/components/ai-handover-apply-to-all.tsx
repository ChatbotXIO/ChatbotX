"use client"

import { AI_HANDOVER_BULK_LIVE_STATUSES } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { Popover, PopoverContent } from "@chatbotx.io/ui/components/ui/popover"
import { Progress } from "@chatbotx.io/ui/components/ui/progress"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useRef, useState } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import { retryApplyToAllAction } from "../actions/retry-apply-to-all.action"
import { setApplyToAllAction } from "../actions/set-apply-to-all.action"
import { applyToAllPollInterval } from "../lib/bulk-run-resource"
import {
  type AiHandoverBulkRunResource,
  type GetApplyToAllStatusResponse,
  setApplyToAllRequest,
} from "../schema/bulk"
import { AI_HANDOVER_MESSAGE_MAX_LENGTH } from "../schema/request"
import { AiHandoverHistoryDialog } from "./ai-handover-history-dialog"

const DATE_TIME_FORMAT = { dateStyle: "short", timeStyle: "short" } as const
const PERCENT_MAX = 100
const MESSAGE_ROWS = 4

type ApplyToAllProps = {
  workspaceId: string
  inboxId: string
  /** False for a non super admin or a platform support session: view only. */
  canEdit: boolean
  initialStatus: GetApplyToAllStatusResponse
}

const doneOf = (run: AiHandoverBulkRunResource): number =>
  run.processedCount + run.skippedCount + run.failedCount

const progressPercent = (run: AiHandoverBulkRunResource): number =>
  run.totalCount
    ? Math.min(
        PERCENT_MAX,
        Math.round((doneOf(run) / run.totalCount) * PERCENT_MAX),
      )
    : 0

/** One line about the run serving the Page's latest state. */
function RunProgress(props: {
  status: GetApplyToAllStatusResponse["status"]
  run: AiHandoverBulkRunResource | null
  canEdit: boolean
  isRetrying: boolean
  onRetry: () => void
}) {
  const { status, run, canEdit, isRetrying, onRetry } = props
  const t = useTranslations()
  const formatter = useFormatter()

  if (status === "reconciling") {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        {t("aiHandover.bulk.preparing")}
      </p>
    )
  }
  if (!run) {
    return null
  }

  if (AI_HANDOVER_BULK_LIVE_STATUSES.includes(run.status)) {
    return (
      <div className="flex flex-col gap-2" role="status">
        <p className="text-sm tabular-nums">
          {run.totalCount === null
            ? t(`aiHandover.bulk.live.${run.action}Counting`)
            : t(`aiHandover.bulk.live.${run.action}`, {
                done: doneOf(run),
                total: run.totalCount,
              })}
        </p>
        <Progress
          aria-label={t("aiHandover.bulk.progress")}
          value={progressPercent(run)}
        />
        {run.pausedUntil && (
          <p className="text-amber-600 text-sm dark:text-amber-400">
            {t("aiHandover.bulk.pausedUntil", {
              at: formatter.dateTime(run.pausedUntil, DATE_TIME_FORMAT),
            })}
          </p>
        )}
      </div>
    )
  }

  if (run.status === "completed") {
    return (
      <p className="text-muted-foreground text-sm tabular-nums">
        {t(`aiHandover.bulk.done.${run.action}`, {
          processed: run.processedCount,
          total: run.totalCount ?? doneOf(run),
        })}
      </p>
    )
  }

  // failed / cancelled: a stopped run of the latest state is final until retried.
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <p className="text-destructive">
        {run.currentError
          ? t(`aiHandover.bulk.runErrors.${run.currentError}`)
          : t(`aiHandover.bulk.stopped.${run.action}`)}
      </p>
      {canEdit && (
        <Button
          disabled={isRetrying}
          onClick={onRetry}
          size="sm"
          type="button"
          variant="outline"
        >
          {isRetrying && <Loader2Icon aria-hidden className="animate-spin" />}
          {t("aiHandover.bulk.retry")}
        </Button>
      )}
    </div>
  )
}

/**
 * v1's "Apply to all customers" switch of a Page. Moving it asks for
 * confirmation (ON) or for the HUMAN_AGENT message (OFF) and takes effect at
 * once, independent of Save; the background run's progress, its pause and its
 * failure (with Retry) are shown beneath, and the history opens in a dialog.
 */
export function AiHandoverApplyToAll(props: ApplyToAllProps) {
  const { workspaceId, inboxId, canEdit, initialStatus } = props
  const t = useTranslations()
  const queryClient = useQueryClient()
  const anchorRef = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<boolean | null>(null)
  const [message, setMessage] = useState("")
  const [isMessageInvalid, setIsMessageInvalid] = useState(false)

  // When the current `reconciling` spell began, so the poll gives up on a
  // change that never gets a run, whatever happened to the query before it.
  const reconcilingSince = useRef<number | null>(null)
  const statusQuery = orpc.aiHandoverAPIs.getApplyToAllStatus.queryOptions({
    input: { workspaceId, inboxId },
    initialData: initialStatus,
    refetchInterval: (query) => {
      if (query.state.data?.status === "reconciling") {
        reconcilingSince.current ??= Date.now()
      } else {
        reconcilingSince.current = null
      }
      return applyToAllPollInterval(
        query,
        reconcilingSince.current === null
          ? 0
          : Date.now() - reconcilingSince.current,
      )
    },
  })
  const { data } = useQuery(statusQuery)
  const status = data ?? initialStatus
  const invalidate = () => {
    reconcilingSince.current = null
    queryClient.invalidateQueries({ queryKey: statusQuery.queryKey })
    // The history dialog lists the run this change just created.
    queryClient.invalidateQueries({
      queryKey: orpc.aiHandoverAPIs.listBulkHistory.key(),
    })
  }

  const closePopover = () => {
    setTarget(null)
    setMessage("")
    setIsMessageInvalid(false)
  }

  const setAction = useAction(
    setApplyToAllAction.bind(null, workspaceId, inboxId),
    {
      onSuccess: () => {
        closePopover()
        invalidate()
      },
      onError: ({ error }) =>
        toast.error(error.serverError ?? t("messages.unknownError")),
    },
  )
  const retryAction = useAction(
    retryApplyToAllAction.bind(null, workspaceId, inboxId),
    {
      onSuccess: () => {
        toast.success(t("aiHandover.bulk.started"))
        invalidate()
      },
      onError: ({ error }) =>
        toast.error(error.serverError ?? t("messages.unknownError")),
    },
  )

  const confirm = () => {
    const request = {
      applyToAllCustomers: target === true,
      message: message.trim(),
    }
    if (!setApplyToAllRequest.safeParse(request).success) {
      setIsMessageInvalid(true)
      return
    }
    setAction.execute(request)
  }

  const isOn = status.applyToAllCustomers
  // From the status (refreshed with it), so a schedule window that opens, or a
  // Save that switches the automation on, unlocks the switch without a reload.
  const isAutomationActive = status.isAutomationActive
  // An ON needs the automation running (the take-back would undo it otherwise).
  const isSwitchDisabled =
    !canEdit || setAction.isExecuting || !(isOn || isAutomationActive)

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label htmlFor="ai-handover-apply-to-all">
            {t("aiHandover.bulk.title")}
          </Label>
          <p className="text-muted-foreground text-sm">
            {t("aiHandover.bulk.description")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AiHandoverHistoryDialog
            inboxId={inboxId}
            isRunLive={AI_HANDOVER_BULK_LIVE_STATUSES.includes(
              status.run?.status ?? "completed",
            )}
            workspaceId={workspaceId}
          />
          <div ref={anchorRef}>
            <Switch
              checked={isOn}
              disabled={isSwitchDisabled}
              id="ai-handover-apply-to-all"
              onCheckedChange={(checked) => setTarget(checked)}
            />
          </div>
        </div>
      </div>

      {canEdit && !(isOn || isAutomationActive) && (
        <p className="text-muted-foreground text-sm">
          {t("aiHandover.bulk.enable.blocked")}
        </p>
      )}

      <RunProgress
        canEdit={canEdit}
        isRetrying={retryAction.isExecuting}
        onRetry={() => retryAction.execute()}
        run={status.run}
        status={status.status}
      />

      <Popover
        onOpenChange={(open) =>
          !(open || setAction.isExecuting) && closePopover()
        }
        open={target !== null}
      >
        <PopoverContent align="end" anchor={anchorRef} className="w-80 gap-3">
          {target ? (
            <p className="text-sm">
              {t("aiHandover.bulk.enable.dialogDescription")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                {t("aiHandover.bulk.disable.dialogDescription")}
              </p>
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 text-xs dark:text-amber-300">
                {t("aiHandover.bulk.disable.policyWarning")}
              </p>
              <Label htmlFor="ai-handover-apply-to-all-message">
                {t("aiHandover.bulk.disable.messageLabel")}
              </Label>
              <Textarea
                aria-invalid={isMessageInvalid}
                disabled={setAction.isExecuting}
                id="ai-handover-apply-to-all-message"
                maxLength={AI_HANDOVER_MESSAGE_MAX_LENGTH}
                onChange={(event) => {
                  setMessage(event.target.value)
                  setIsMessageInvalid(false)
                }}
                placeholder={t("aiHandover.bulk.disable.messagePlaceholder")}
                rows={MESSAGE_ROWS}
                value={message}
              />
              <p
                className={
                  isMessageInvalid
                    ? "text-destructive text-xs"
                    : "text-muted-foreground text-xs"
                }
                role={isMessageInvalid ? "alert" : undefined}
              >
                {isMessageInvalid
                  ? t("aiHandover.bulk.errors.messageRequired")
                  : t("aiHandover.bulk.disable.messageDescription", {
                      max: AI_HANDOVER_MESSAGE_MAX_LENGTH,
                    })}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              disabled={setAction.isExecuting}
              onClick={closePopover}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("actions.cancel")}
            </Button>
            <Button
              disabled={setAction.isExecuting}
              onClick={confirm}
              size="sm"
              type="button"
            >
              {setAction.isExecuting && (
                <Loader2Icon aria-hidden className="animate-spin" />
              )}
              {target
                ? t("aiHandover.bulk.enable.confirm")
                : t("aiHandover.bulk.disable.confirm")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
