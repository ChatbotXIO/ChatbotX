"use client"

import type { AIEmbeddingStatus } from "@aha.chat/database/types"
import { Badge } from "@aha.chat/ui/components/ui/badge"
import { useTranslations } from "next-intl"
import { type ReactNode, useMemo } from "react"

type AIFileProcessingStatusProps = {
  aiFileId: string
  chunksCount?: number
  processingStatus: AIEmbeddingStatus
}

function createStatusBadge(
  t: ReturnType<typeof useTranslations>,
): Record<AIEmbeddingStatus, ReactNode> {
  return {
    pending: <Badge variant="outline">{t("fields.status.pending")}</Badge>,
    processing: (
      <Badge variant="secondary">{t("fields.status.processing")}</Badge>
    ),
    success: (
      <Badge className="bg-green-500" variant="default">
        {t("fields.status.success")}
      </Badge>
    ),
    error: <Badge variant="destructive">{t("fields.status.error")}</Badge>,
  }
}

export function AIFileProcessingStatus(props: AIFileProcessingStatusProps) {
  const { processingStatus } = props
  const t = useTranslations()
  const statusBadgeMap = useMemo(() => createStatusBadge(t), [t])
  const statusBadge = useMemo(
    () => statusBadgeMap[processingStatus],
    [statusBadgeMap, processingStatus],
  )

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">{statusBadge}</div>
    </div>
  )
}
