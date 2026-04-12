"use client"

import type {
  GetSequenceStepStatsRequest,
  GetSequenceStepStatsResponse,
  SequenceStepEventType,
} from "@chatbotx.io/analytics/schemas"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import ky from "ky"
import { useParams } from "next/navigation"
import { memo, useEffect, useState } from "react"
import { SequenceStepContactsDialog } from "./sequence-step-contacts-dialog"

type Props = {
  sequenceId: string
  stepId?: string
}

export const SequenceStepStats = memo(function SequenceStepStats({
  sequenceId,
  stepId,
}: Props) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [stats, setStats] = useState<GetSequenceStepStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedEventType, setSelectedEventType] =
    useState<SequenceStepEventType>("message:sent")
  const [selectedTotal, setSelectedTotal] = useState(0)

  useEffect(() => {
    if (!stepId) {
      setIsLoading(false)
      return
    }

    let isMounted = true

    async function fetchStats() {
      try {
        const result = await ky
          .get<GetSequenceStepStatsRequest>(
            `/api/workspaces/${workspaceId}/sequences/${sequenceId}/steps/${stepId}/stats`,
          )
          .json<GetSequenceStepStatsResponse>()

        if (isMounted) {
          setStats(result)
        }
      } catch (error) {
        console.error("Failed to fetch sequence step stats:", error)
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchStats()

    return () => {
      isMounted = false
    }
  }, [workspaceId, sequenceId, stepId])

  const formatValue = (value: number) => {
    return value ? value.toLocaleString() : "----"
  }

  const handleStatClick = (eventType: SequenceStepEventType, total: number) => {
    if (total > 0 && stepId) {
      setSelectedEventType(eventType)
      setSelectedTotal(total)
      setDialogOpen(true)
    }
  }

  const getPercentage = (value: number, total: number) => {
    if (!(value && total)) {
      return null
    }
    const percentage = (value / total) * 100
    return percentage.toFixed(1)
  }

  if (isLoading) {
    return (
      <div className="flex w-[300px] items-center justify-between gap-4">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
      </div>
    )
  }

  const sent = stats?.["message:sent"] ?? 0
  const delivered = stats?.["message:delivered"] ?? 0
  const seen = stats?.["message:seen"] ?? 0
  const clicked = stats?.["flow:clicked"] ?? 0
  const failed = stats?.["message:failed"] ?? 0

  return (
    <>
      <div className="flex w-[300px] items-center justify-between gap-4 text-xs">
        <button
          className={
            sent === 0
              ? "w-12 text-center tabular-nums transition-colors disabled:cursor-default disabled:hover:text-current"
              : "w-12 cursor-pointer text-center tabular-nums transition-colors hover:text-primary disabled:cursor-default disabled:hover:text-current"
          }
          disabled={sent === 0}
          onClick={() => handleStatClick("message:sent", sent)}
          type="button"
        >
          {formatValue(sent)}
        </button>
        <button
          className={
            delivered === 0
              ? "w-12 text-center tabular-nums transition-colors disabled:cursor-default disabled:hover:text-current"
              : "w-12 cursor-pointer text-center tabular-nums transition-colors hover:text-primary disabled:cursor-default disabled:hover:text-current"
          }
          disabled={delivered === 0}
          onClick={() => handleStatClick("message:delivered", delivered)}
          type="button"
        >
          {formatValue(delivered)}
        </button>
        <button
          className={
            seen === 0
              ? "w-12 text-center tabular-nums transition-colors disabled:cursor-default disabled:hover:text-current"
              : "w-12 cursor-pointer text-center tabular-nums transition-colors hover:text-primary disabled:cursor-default disabled:hover:text-current"
          }
          disabled={seen === 0}
          onClick={() => handleStatClick("message:seen", seen)}
          type="button"
        >
          {formatValue(seen)}
          {getPercentage(seen, sent) && (
            <span className="ml-0.5 text-muted-foreground">
              ({getPercentage(seen, sent)}%)
            </span>
          )}
        </button>
        <button
          className={
            clicked === 0
              ? "w-12 text-center tabular-nums transition-colors disabled:cursor-default disabled:hover:text-current"
              : "w-12 cursor-pointer text-center tabular-nums transition-colors hover:text-primary disabled:cursor-default disabled:hover:text-current"
          }
          disabled={clicked === 0}
          onClick={() => handleStatClick("flow:clicked", clicked)}
          type="button"
        >
          {formatValue(clicked)}
          {getPercentage(clicked, sent) && (
            <span className="ml-0.5 text-muted-foreground">
              ({getPercentage(clicked, sent)}%)
            </span>
          )}
        </button>
        <button
          className={
            failed === 0
              ? "w-12 text-center tabular-nums transition-colors disabled:cursor-default disabled:hover:text-current"
              : "w-12 cursor-pointer text-center tabular-nums transition-colors hover:text-primary disabled:cursor-default disabled:hover:text-current"
          }
          disabled={failed === 0}
          onClick={() => handleStatClick("message:failed", failed)}
          type="button"
        >
          {formatValue(failed)}
        </button>
      </div>

      {stepId && (
        <SequenceStepContactsDialog
          eventType={selectedEventType}
          onOpenChange={setDialogOpen}
          open={dialogOpen}
          sequenceId={sequenceId}
          stepId={stepId}
          total={selectedTotal}
          workspaceId={workspaceId}
        />
      )}
    </>
  )
})
