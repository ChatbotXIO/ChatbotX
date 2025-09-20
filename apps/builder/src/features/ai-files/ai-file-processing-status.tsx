"use client"

import { useState } from "react"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Badge } from "@aha.chat/ui/components/ui/badge"
import { Loader2, FileText, CheckCircle, XCircle, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { useAction } from "next-safe-action/hooks"
import { processAiFileEmbeddingAction } from "./actions/process-ai-file-embedding.action"
import { useParams } from "next/navigation"

type AIFileProcessingStatusProps = {
  aiFileId: string
  isProcessed?: boolean
  chunksCount?: number
}

type ProcessingStatus = 'idle' | 'processing' | 'success' | 'error'

export function AIFileProcessingStatus({ 
  aiFileId, 
  isProcessed = false, 
  chunksCount = 0 
}: AIFileProcessingStatusProps) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const [status, setStatus] = useState<ProcessingStatus>(isProcessed ? 'success' : 'idle')
  const [chunks, setChunks] = useState(chunksCount)
  
  const { execute, isPending } = useAction(
    processAiFileEmbeddingAction.bind(null, chatbotId),
    {
      onSuccess: (result) => {
        setStatus('success')
        setChunks(result.data.chunksProcessed)
        toast.success(`Successfully processed file: ${result.data.chunksProcessed} chunks created`)
      },
      onError: (error) => {
        setStatus('error')
        toast.error(error.error.serverError || 'Failed to process file')
      },
    }
  )

  const handleProcessFile = async () => {
    setStatus('processing')
    execute({ aiFileId })
  }

  const getStatusIcon = () => {
    switch (status) {
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin" />
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const getStatusBadge = () => {
    switch (status) {
      case 'processing':
        return <Badge variant="secondary">Processing...</Badge>
      case 'success':
        return <Badge variant="default" className="bg-green-500">Processed</Badge>
      case 'error':
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
      
      {status === 'success' && chunks > 0 && (
        <span className="text-sm text-muted-foreground">
          {chunks} chunks
        </span>
      )}

      {status !== 'processing' && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleProcessFile}
          disabled={isPending}
          className="h-8"
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          <span className="ml-1">
            {status === 'success' ? 'Reprocess' : 'Process'}
          </span>
        </Button>
      )}
    </div>
  )
}
