"use client"

import type { GetBroadcastStatsResponse } from "@chatbotx.io/analytics/schemas"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useParams } from "next/navigation"
import { memo, useCallback, useEffect, useState } from "react"
import { client } from "@/lib/orpc/orpc"
import { BroadcastContactsDialog } from "./broadcast-contacts-dialog"

type Props = {
  broadcastId: string
  field: keyof GetBroadcastStatsResponse
}

export const BroadcastStatsCell = memo(function BroadcastStatsCell({
  broadcastId,
  field,
}: Props) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [stats, setStats] = useState<GetBroadcastStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function fetchStats() {
      try {
        const result = await client.broadcastAPIs.privateGetBroadcastStatsAPI({
          workspaceId,
          broadcastId,
        })

        if (isMounted) {
          setStats(result)
        }
      } catch (error) {
        console.error("Failed to fetch broadcast stats:", error)
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
  }, [workspaceId, broadcastId])

  const handleClick = useCallback(() => {
    setDialogOpen(true)
  }, [])

  const handleDialogChange = useCallback((open: boolean) => {
    setDialogOpen(open)
  }, [])

  if (isLoading) {
    return <Skeleton className="h-4 w-12" />
  }

  if (!stats) {
    return <span className="text-muted-foreground">-</span>
  }

  const value = stats[field]
  const sent = stats["message:sent"]

  const getPercentage = () => {
    if (field === "message:sent" || !value || !sent) {
      return null
    }
    const percentage = (value / sent) * 100
    return percentage.toFixed(1)
  }

  const percentage = getPercentage()

  return (
    <>
      <button
        className={
          value ? "cursor-pointer tabular-nums hover:underline" : "tabular-nums"
        }
        disabled={!value}
        onClick={handleClick}
        type="button"
      >
        {value ? value.toLocaleString() : "----"}
        {percentage && (
          <span className="ml-1 text-muted-foreground">({percentage}%)</span>
        )}
      </button>

      <BroadcastContactsDialog
        broadcastId={broadcastId}
        eventType={field}
        onOpenChange={handleDialogChange}
        open={dialogOpen}
        total={value}
        workspaceId={workspaceId}
      />
    </>
  )
})
