"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { CheckCircle2Icon, Loader2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { triggerLeaderboardRewardsAction } from "../../actions/trigger-leaderboard-rewards.action"
import { useInvalidateLeaderboards } from "../../lib/use-invalidate-leaderboards"
import type { LeaderboardRow } from "../../queries"

type RewardsResult = { winners: number; sent: number; skipped: number }

/**
 * "Trigger rewards" for a finished leaderboard: shows the configured reward
 * flow and top N, runs `triggerLeaderboardRewards` once, then the counts.
 */
export function TriggerRewardsDialog({
  workspaceId,
  leaderboard,
  open,
  onOpenChange,
}: {
  workspaceId: string
  leaderboard: Pick<
    LeaderboardRow,
    "id" | "rewardSettings" | "rewardsTriggeredAt" | "status"
  >
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations()
  const router = useRouter()
  const invalidateLeaderboards = useInvalidateLeaderboards()
  const flowOptions = useFlowSelectOptions({ enabled: open })
  const [result, setResult] = useState<RewardsResult | null>(null)
  const boundAction = useMemo(
    () =>
      triggerLeaderboardRewardsAction.bind(null, workspaceId, leaderboard.id),
    [workspaceId, leaderboard.id],
  )
  const { execute, isPending } = useAction(boundAction, {
    onSuccess: ({ data }) => {
      if (data) {
        setResult(data)
      }
      invalidateLeaderboards()
      router.refresh()
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? t("messages.error"))
    },
  })

  const { flowId, topN } = leaderboard.rewardSettings
  const flowName = flowId
    ? (flowOptions.find((option) => option.value === flowId)?.label ?? flowId)
    : null
  const alreadySent = Boolean(leaderboard.rewardsTriggeredAt)
  const disabled =
    isPending || alreadySent || !flowId || leaderboard.status !== "finished"

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      setResult(null)
    }
  }

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("leaderboards.rewards.title")}</DialogTitle>
          <DialogDescription>
            {t("leaderboards.rewards.description")}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="flex items-start gap-3">
            <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-emerald-500" />
            <p className="text-sm">
              {t("leaderboards.rewards.result", {
                sent: result.sent,
                skipped: result.skipped,
              })}
            </p>
          </div>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">
              {t("leaderboards.rewards.flow")}
            </dt>
            <dd className="font-medium">
              {flowName ?? t("leaderboards.rewards.noFlow")}
            </dd>
            <dt className="text-muted-foreground">
              {t("leaderboards.rewards.topN")}
            </dt>
            <dd className="font-medium">{topN}</dd>
          </dl>
        )}
        {alreadySent && !result ? (
          <p className="text-muted-foreground text-sm">
            {t("leaderboards.rewards.alreadySent")}
          </p>
        ) : null}
        <DialogFooter className="gap-2">
          <Button
            onClick={() => handleOpenChange(false)}
            type="button"
            variant="ghost"
          >
            {result ? t("actions.ok") : t("actions.cancel")}
          </Button>
          {result ? null : (
            <Button disabled={disabled} onClick={() => execute()} type="button">
              {isPending ? <Loader2Icon className="animate-spin" /> : null}
              {t("leaderboards.rewards.confirm")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
