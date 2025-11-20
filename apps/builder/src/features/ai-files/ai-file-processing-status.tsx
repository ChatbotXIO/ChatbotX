"use client"

import { Badge } from "@aha.chat/ui/components/ui/badge"
import { CheckCircle, FileText, Loader2, XCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import { type ReactNode, useMemo } from "react"
import type { ProcessingStatus } from "./schemas"

type AIFileProcessingStatusProps = {
  aiFileId: string
  chunksCount?: number
  processingStatus: ProcessingStatus
}

// use shared type ProcessingStatus from schemas

const STATUS_ICON: Record<ProcessingStatus, ReactNode> = {
  idle: <FileText className="h-4 w-4" />,
  processing: <Loader2 className="h-4 w-4 animate-spin" />,
  success: <CheckCircle className="h-4 w-4 text-green-500" />,
  error: <XCircle className="h-4 w-4 text-red-500" />,
}

function createStatusBadge(
  t: ReturnType<typeof useTranslations>,
): Record<ProcessingStatus, ReactNode> {
  return {
    idle: <Badge variant="outline">{t("fields.status.idle")}</Badge>,
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
  const statusIcon = useMemo(
    () => STATUS_ICON[processingStatus],
    [processingStatus],
  )
  const statusBadgeMap = useMemo(() => createStatusBadge(t), [t])
  const statusBadge = useMemo(
    () => statusBadgeMap[processingStatus],
    [statusBadgeMap, processingStatus],
  )

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {statusIcon}
        {statusBadge}
      </div>
    </div>
  )
}
