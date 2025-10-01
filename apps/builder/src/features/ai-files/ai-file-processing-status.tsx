"use client"

import { Badge } from "@aha.chat/ui/components/ui/badge"
import { CheckCircle, FileText, Loader2, XCircle } from "lucide-react"
import { useState } from "react"

type AIFileProcessingStatusProps = {
  aiFileId: string
  isProcessed?: boolean
  chunksCount?: number
  processingStatus?: "idle" | "processing" | "success" | "error"
}

type ProcessingStatus = "idle" | "processing" | "success" | "error"

export function AIFileProcessingStatus(props: AIFileProcessingStatusProps) {
  const { chunksCount = 0, processingStatus = "idle" } = props
  const [status] = useState<ProcessingStatus>(processingStatus)

  const getStatusIcon = () => {
    switch (status) {
      case "processing":
        return <Loader2 className="h-4 w-4 animate-spin" />
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const getStatusBadge = () => {
    switch (status) {
      case "processing":
        return <Badge variant="secondary">Processing...</Badge>
      case "success":
        return (
          <Badge className="bg-green-500" variant="default">
            Processed
          </Badge>
        )
      case "error":
        return <Badge variant="destructive">Error</Badge>
      default:
        return <Badge variant="outline">Not Processed</Badge>
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        {getStatusIcon()}
        {getStatusBadge()}
      </div>

      {status === "success" && chunksCount > 0 && (
        <span className="text-muted-foreground text-sm">
          {chunksCount} chunks
        </span>
      )}
    </div>
  )
}
