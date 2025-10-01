"use client"

import { Badge } from "@aha.chat/ui/components/ui/badge"
import { CheckCircle, FileText, Loader2, XCircle } from "lucide-react"
import { useMemo } from "react"

type AIFileProcessingStatusProps = {
  aiFileId: string
  isProcessed?: boolean
  chunksCount?: number
  processingStatus?: "idle" | "processing" | "success" | "error"
}

type ProcessingStatus = "idle" | "processing" | "success" | "error"

const STATUS_ICON: Record<ProcessingStatus, React.ReactNode> = {
  idle: <FileText className="h-4 w-4" />,
  processing: <Loader2 className="h-4 w-4 animate-spin" />,
  success: <CheckCircle className="h-4 w-4 text-green-500" />,
  error: <XCircle className="h-4 w-4 text-red-500" />,
}

const STATUS_BADGE: Record<ProcessingStatus, React.ReactNode> = {
  idle: <Badge variant="outline">Not Processed</Badge>,
  processing: <Badge variant="secondary">Processing...</Badge>,
  success: (
    <Badge className="bg-green-500" variant="default">
      Processed
    </Badge>
  ),
  error: <Badge variant="destructive">Error</Badge>,
}

export function AIFileProcessingStatus(props: AIFileProcessingStatusProps) {
  const { chunksCount = 0, processingStatus = "idle" } = props
  const statusIcon = useMemo(
    () => STATUS_ICON[processingStatus],
    [processingStatus],
  )
  const statusBadge = useMemo(
    () => STATUS_BADGE[processingStatus],
    [processingStatus],
  )

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {statusIcon}
        {statusBadge}
      </div>

      {processingStatus === "success" && chunksCount > 0 && (
        <span className="text-muted-foreground text-sm">
          {chunksCount} chunks
        </span>
      )}
    </div>
  )
}
