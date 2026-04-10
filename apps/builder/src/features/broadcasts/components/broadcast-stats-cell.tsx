"use client"

import { Skeleton } from "@aha.chat/ui/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useState } from "react"
import { client } from "@/lib/orpc/orpc"
import type { BroadcastEventType } from "../schemas/broadcast-contacts"
import type { GetBroadcastStatsResponse } from "../schemas/broadcast-stats"
import { BroadcastContactsDialog } from "./broadcast-contacts-dialog"

type Props = {
  broadcastId: string
  field: keyof GetBroadcastStatsResponse
}

export const BroadcastStatsCell = memo(function BroadcastStatsCell({
  broadcastId,
  field,
}: Props) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()
  const [stats, setStats] = useState<GetBroadcastStatsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function fetchStats() {
      try {
        const result = await client.broadcastAPIs.privateGetBroadcastStatsAPI({
          chatbotId,
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
  }, [chatbotId, broadcastId])

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

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="cursor-pointer tabular-nums hover:underline"
            onClick={handleClick}
            type="button"
          >
            {value.toLocaleString()}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {t(`broadcasts.stats.${field}`)}: {value.toLocaleString()}
          </p>
        </TooltipContent>
      </Tooltip>

      <BroadcastContactsDialog
        broadcastId={broadcastId}
        chatbotId={chatbotId}
        eventType={field as BroadcastEventType}
        onOpenChange={handleDialogChange}
        open={dialogOpen}
        total={value}
      />
    </>
  )
})
