"use client"

import type {
  AIFileModel,
  AIFunctionModel,
  AIMCPServerModel,
} from "@chatbotx.io/database/types"
import type { LucideIcon } from "lucide-react"
import { FileIcon, FunctionSquareIcon, ServerIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

export type AIToolMultiSelectGroupOption = {
  label: string
  value: string
  icon: LucideIcon
}

export type AIToolMultiSelectGroup = {
  heading: string
  options: AIToolMultiSelectGroupOption[]
}

export type AIToolMultiSelectSource = {
  files: Pick<AIFileModel, "id" | "name">[]
  functions: Pick<AIFunctionModel, "id" | "name">[]
  mcpServers: Pick<AIMCPServerModel, "id" | "name">[]
}

export const buildAIToolMultiSelectGroups = (
  source: AIToolMultiSelectSource,
  labels: {
    file: string
    fn: string
    mcp: string
  },
): AIToolMultiSelectGroup[] => {
  const { files, functions, mcpServers } = source

  return [
    {
      heading: labels.file,
      options: files.map((file) => ({
        label: file.name,
        value: `file:${file.id}`,
        icon: FileIcon,
      })),
    },
    {
      heading: labels.fn,
      options: functions.map((fn) => ({
        label: fn.name,
        value: `fn:${fn.id}`,
        icon: FunctionSquareIcon,
      })),
    },
    {
      heading: labels.mcp,
      options: mcpServers.map((mcpServer) => ({
        label: mcpServer.name,
        value: `mcp:${mcpServer.id}`,
        icon: ServerIcon,
      })),
    },
  ]
}

export const useAIToolMultiSelectGroups = ({
  files,
  functions,
  mcpServers,
}: AIToolMultiSelectSource): AIToolMultiSelectGroup[] => {
  const t = useTranslations()

  return useMemo(
    () =>
      buildAIToolMultiSelectGroups(
        { files, functions, mcpServers },
        {
          file: t("fields.file.label"),
          fn: t("fields.function.label"),
          mcp: t("fields.mcpServer.label"),
        },
      ),
    [files, functions, mcpServers, t],
  )
}
