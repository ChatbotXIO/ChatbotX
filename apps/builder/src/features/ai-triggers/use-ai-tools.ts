"use client"

import { FileIcon, FunctionSquareIcon, ServerIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useAIToolsStore } from "./provider/ai-tools-store-context"

export const useAIToolOptions = () => {
  const t = useTranslations()

  const { files, functions, mcpServers } = useAIToolsStore((store) => store)

  return useMemo(
    () => [
      {
        label: "File",
        value: "file",
        children: files.map((file) => ({
          label: file.name,
          value: `file:${file.id}`,
          icon: FileIcon,
        })),
      },
      {
        label: t("fields.function.label"),
        value: "function",
        children: functions.map((fn) => ({
          label: fn.name,
          value: `fn:${fn.id}`,
          icon: FunctionSquareIcon,
        })),
      },
      {
        label: t("fields.mcpServer.label"),
        value: "mcp",
        children: mcpServers.map((mcpServer) => ({
          label: mcpServer.name,
          value: `mcp:${mcpServer.id}`,
          icon: ServerIcon,
        })),
      },
    ],
    [files, functions, mcpServers, t],
  )
}
