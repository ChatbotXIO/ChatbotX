"use client"

import type {
  AIFileModel,
  AIFunctionModel,
  AIMCPServerModel,
} from "@chatbotx.io/database/types"
import type { LucideIcon } from "lucide-react"
import {
  FileIcon,
  FunctionSquareIcon,
  ServerIcon,
  SettingsIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import {
  fileToolId,
  fncToolId,
  mcpToolId,
  sysToolId,
  type ToolId,
} from "../lib/tool-id"

export type AIToolMultiSelectGroupOption = {
  label: string
  value: ToolId
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
  systemFunctions?: { id: string; name: string }[]
}

const buildAIToolMultiSelectGroups = (
  source: AIToolMultiSelectSource,
  labels: {
    file: string
    fn: string
    mcp: string
    sys: string
  },
): AIToolMultiSelectGroup[] => {
  const { files, functions, mcpServers, systemFunctions = [] } = source

  const groups: AIToolMultiSelectGroup[] = [
    {
      heading: labels.file,
      options: files.map((file) => ({
        label: file.name,
        value: fileToolId(file.id),
        icon: FileIcon,
      })),
    },
    {
      heading: labels.fn,
      options: functions.map((fn) => ({
        label: fn.name,
        value: fncToolId(fn.id),
        icon: FunctionSquareIcon,
      })),
    },
    {
      heading: labels.mcp,
      options: mcpServers.map((mcpServer) => ({
        label: mcpServer.name,
        value: mcpToolId(mcpServer.id),
        icon: ServerIcon,
      })),
    },
  ]

  if (systemFunctions.length > 0) {
    groups.push({
      heading: labels.sys,
      options: systemFunctions.map((sysFn) => ({
        label: sysFn.name,
        value: sysToolId(sysFn.id),
        icon: SettingsIcon,
      })),
    })
  }

  return groups
}

export const useAIToolMultiSelectGroups = ({
  files,
  functions,
  mcpServers,
  systemFunctions,
}: AIToolMultiSelectSource): AIToolMultiSelectGroup[] => {
  const t = useTranslations()

  return useMemo(
    () =>
      buildAIToolMultiSelectGroups(
        { files, functions, mcpServers, systemFunctions },
        {
          file: t("fields.file.label"),
          fn: t("fields.function.label"),
          mcp: t("fields.mcpServer.label"),
          sys: t("fields.systemFunction.label"),
        },
      ),
    [files, functions, mcpServers, systemFunctions, t],
  )
}
