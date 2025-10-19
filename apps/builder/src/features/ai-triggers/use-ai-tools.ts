"use client"

import type {
  AIFileModel,
  AIFunctionModel,
  AIMCPServerModel,
} from "@aha.chat/database/types"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"

//

type AIToolsData = {
  files: AIFileModel[]
  functions: AIFunctionModel[]
  mcpServers: AIMCPServerModel[]
}

type AIToolsOptions = Array<{
  heading: string
  options: Array<{
    label: string
    value: string
    icon: React.ComponentType
  }>
}>

export function useAITools() {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const [toolsData, setToolsData] = useState<AIToolsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchTools = async () => {
    if (!chatbotId || toolsData) {
      return // Already loaded or no chatbotId
    }

    setLoading(true)
    setError(null)

    try {
      const [filesResp, functionsResp, mcpServersResp] = await Promise.all([
        fetch(`/api/chatbots/${chatbotId}/ai-files`).then((r) => r.json()),
        fetch(`/api/chatbots/${chatbotId}/ai-functions`).then((r) => r.json()),
        fetch(`/api/chatbots/${chatbotId}/ai-mcp-servers`).then((r) =>
          r.json(),
        ),
      ])

      setToolsData({
        files: (filesResp?.data as AIFileModel[]) || [],
        functions: (functionsResp?.data as AIFunctionModel[]) || [],
        mcpServers: (mcpServersResp?.data as AIMCPServerModel[]) || [],
      })
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch tools"))
    } finally {
      setLoading(false)
    }
  }

  const toolOptions: AIToolsOptions = useMemo(() => {
    if (!toolsData) {
      return []
    }

    return [
      {
        heading: t("fields.file.label"),
        options: toolsData.files.map((file) => ({
          label: file.name,
          value: `file:${file.id}`,
          icon: (() => null) as React.ComponentType, // Will be set by the component
        })),
      },
      {
        heading: t("fields.function.label"),
        options: toolsData.functions.map((fn) => ({
          label: fn.name,
          value: `fn:${fn.id}`,
          icon: (() => null) as React.ComponentType, // Will be set by the component
        })),
      },
      {
        heading: t("fields.mcpServer.label"),
        options: toolsData.mcpServers.map((mcpServer) => ({
          label: mcpServer.name,
          value: `mcp:${mcpServer.id}`,
          icon: (() => null) as React.ComponentType, // Will be set by the component
        })),
      },
    ]
  }, [toolsData, t])

  return {
    toolOptions,
    loading,
    error,
    fetchTools,
    hasData: !!toolsData,
  }
}
