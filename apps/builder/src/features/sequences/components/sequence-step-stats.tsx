"use client"

import type {
  GetSequenceStepStatsRequest,
  GetSequenceStepStatsResponse,
  SequenceStepEventType,
} from "@chatbotx.io/analytics/schemas"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { cn } from "@chatbotx.io/ui/lib/utils"
import ky from "ky"
import { useParams } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
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
  const t = useTranslations()
  const formatter = useFormatter()
  const [stats, setStats] = useState<GetSequenceStepStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
          setError(null)
        }
      } catch (fetchError) {
        console.error("Failed to fetch sequence step stats:", fetchError)
        if (isMounted) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to load stats",
          )
        }
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

  const formatValue = (value: number) =>
    stats === null ? "----" : formatter.number(value)

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
      <div className="flex @6xl:w-100 w-full items-center justify-between gap-4">
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

  const statItems: Array<{
    eventType: SequenceStepEventType
    label: string
    value: number
    percentage: string | null
  }> = [
    {
      eventType: "message:sent",
      label: t("sequences.stats.sent"),
      value: sent,
      percentage: null,
    },
    {
      eventType: "message:delivered",
      label: t("sequences.stats.delivered"),
      value: delivered,
      percentage: getPercentage(delivered, sent),
    },
    {
      eventType: "message:seen",
      label: t("sequences.stats.seen"),
      value: seen,
      percentage: getPercentage(seen, delivered),
    },
    {
      eventType: "flow:clicked",
      label: t("sequences.stats.clicked"),
      value: clicked,
      percentage: getPercentage(clicked, delivered),
    },
    {
      eventType: "message:failed",
      label: t("sequences.stats.failed"),
      value: failed,
      percentage: getPercentage(failed, sent),
    },
  ]

  return (
    <>
      <div
        className="flex @6xl:w-100 w-full items-center justify-between gap-4 text-xs"
        title={error ?? undefined}
      >
        {statItems.map((statItem) => (
          <button
            className={cn(
              "flex @6xl:w-12 flex-col items-center text-center tabular-nums transition-colors disabled:cursor-default disabled:hover:text-current",
              statItem.value > 0 && "cursor-pointer hover:text-primary",
            )}
            disabled={statItem.value === 0}
            key={statItem.eventType}
            onClick={() => handleStatClick(statItem.eventType, statItem.value)}
            type="button"
          >
            <span className="@6xl:hidden text-muted-foreground">
              {statItem.label}
            </span>
            <span>
              {formatValue(statItem.value)}
              {statItem.percentage && (
                <span className="ms-0.5 text-muted-foreground">
                  ({statItem.percentage}%)
                </span>
              )}
            </span>
          </button>
        ))}
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
