"use client"

import { FileIcon, FunctionSquareIcon, ServerIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAIToolsStore } from "./provider/ai-tools-store-context"

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
  const files = useAIToolsStore((store) => store.files)
  const functions = useAIToolsStore((store) => store.functions)
  const mcpServers = useAIToolsStore((store) => store.mcpServers)
  const loading = useAIToolsStore((store) => store.loading)
  const error = useAIToolsStore((store) => store.error)
  const fetchTools = useAIToolsStore((store) => store.refetch)
  const initialized = useAIToolsStore((store) => store.initialized)

  const toolOptions: AIToolsOptions = useMemo(() => {
    if (!initialized) {
      return []
    }

    return [
      {
        heading: t("fields.file.label"),
        options: files.map((file) => ({
          label: file.name,
          value: `file:${file.id}`,
          icon: FileIcon,
        })),
      },
      {
        heading: t("fields.function.label"),
        options: functions.map((fn) => ({
          label: fn.name,
          value: `fn:${fn.id}`,
          icon: FunctionSquareIcon,
        })),
      },
      {
        heading: t("fields.mcpServer.label"),
        options: mcpServers.map((mcpServer) => ({
          label: mcpServer.name,
          value: `mcp:${mcpServer.id}`,
          icon: ServerIcon,
        })),
      },
    ]
  }, [files, functions, mcpServers, initialized, t])

  return {
    toolOptions,
    loading,
    error: error ? new Error(error) : null,
    fetchTools,
    hasData: initialized,
  }
}
