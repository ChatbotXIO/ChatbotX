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
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import { formatDistanceToNowStrict } from "date-fns"
import { AlertTriangleIcon, Loader2Icon, Trash2Icon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { safeActionErrorHandler } from "@/lib/errors/safe-action-error-handler"
import { cancelWorkspaceDeletionAction } from "../actions/cancel-workspace-deletion-action"
import { scheduleWorkspaceDeletionAction } from "../actions/schedule-workspace-deletion-action"

function formatCountdown(target: string | Date | null) {
  if (!target) {
    return null
  }

  const targetDate = new Date(target)
  if (Number.isNaN(targetDate.getTime())) {
    return null
  }

  // `round`, not `ceil`: scheduledDeletionAt is rounded up to the purge cron
  // boundary, so the real distance is 24h + up to 30m (~1.01 days). `ceil` would
  // inflate that to "2 days"; `round` keeps it at the intended "1 day".
  return formatDistanceToNowStrict(targetDate, {
    addSuffix: true,
    roundingMethod: "round",
  })
}

function useCountdown(target: string | Date | null) {
  const [countdown, setCountdown] = useState(() => formatCountdown(target))

  useEffect(() => {
    setCountdown(formatCountdown(target))

    if (!target) {
      return
    }

    const timer = window.setInterval(() => {
      setCountdown(formatCountdown(target))
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [target])

  return countdown
}

export function WorkspaceDeletionCard({
  workspace,
}: {
  workspace: {
    id: string
    scheduledDeletionAt: string | Date | null
  }
}) {
  const t = useTranslations()
  const locale = useLocale()
  const countdown = useCountdown(workspace.scheduledDeletionAt)
  const deletionDate = formatDate(workspace.scheduledDeletionAt ?? undefined, {
    hour: "numeric",
    minute: "numeric",
    locale,
  })

  const reloadPage = () => {
    window.location.reload()
  }

  const { execute: scheduleDeletion, isPending: isScheduling } = useAction(
    scheduleWorkspaceDeletionAction.bind(null, workspace.id),
    {
      onSuccess: reloadPage,
      onError: safeActionErrorHandler,
    },
  )

  const { execute: cancelDeletion, isPending: isCancelling } = useAction(
    cancelWorkspaceDeletionAction.bind(null, workspace.id),
    {
      onSuccess: reloadPage,
      onError: safeActionErrorHandler,
    },
  )

  const isPending = isScheduling || isCancelling

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangleIcon className="mt-0.5 size-5 text-destructive" />
          <div className="space-y-1">
            <h3 className="font-medium text-sm">
              {t("workspace.deletion.title")}
            </h3>
            <p className="text-muted-foreground text-sm">
              {workspace.scheduledDeletionAt
                ? t("workspace.deletion.pending", {
                    countdown:
                      countdown ?? t("workspace.deletion.pendingFallback"),
                    date: deletionDate,
                  })
                : t("workspace.deletion.description")}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {workspace.scheduledDeletionAt ? (
            <Button
              disabled={isPending}
              onClick={() => cancelDeletion()}
              size="sm"
              type="button"
              variant="outline"
            >
              {isCancelling && <Loader2Icon className="animate-spin" />}
              {t("actions.undo")}
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    disabled={isPending}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    {isScheduling && <Loader2Icon className="animate-spin" />}
                    <Trash2Icon className="size-4" />
                    {t("workspace.deletion.schedule")}
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("workspace.deletion.confirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("workspace.deletion.confirmDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive hover:bg-destructive/90"
                    disabled={isPending}
                    onClick={() => scheduleDeletion()}
                  >
                    {isScheduling && <Loader2Icon className="animate-spin" />}
                    {t("actions.delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
