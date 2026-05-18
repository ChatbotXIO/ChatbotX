"use client"

import { systemFunctionNames } from "@chatbotx.io/ai"
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
  systemFunctions?: { id: string; name: string }[]
}

export const buildAIToolMultiSelectGroups = (
  source: AIToolMultiSelectSource,
  labels: {
    file: string
    fn: string
    mcp: string
    sys: string
    systemFunctions: Record<string, string>
  },
): AIToolMultiSelectGroup[] => {
  const { files, functions, mcpServers, systemFunctions = [] } = source

  const groups: AIToolMultiSelectGroup[] = [
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

  // System functions always at the end
  if (systemFunctions.length > 0) {
    groups.push({
      heading: labels.sys,
      options: systemFunctions.map((sysFn) => ({
        label: labels.systemFunctions[sysFn.id] ?? sysFn.name,
        value: `sys:${sysFn.id}`,
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
          systemFunctions: {
            [systemFunctionNames.connectUserToHuman]: t(
              "fields.systemFunction.names.connectUserToHuman",
            ),
            [systemFunctionNames.documentReader]: t(
              "fields.systemFunction.names.documentReader",
            ),
            [systemFunctionNames.imageReader]: t(
              "fields.systemFunction.names.imageReader",
            ),
            [systemFunctionNames.urlContext]: t(
              "fields.systemFunction.names.urlContext",
            ),
            [systemFunctionNames.webSearch]: t(
              "fields.systemFunction.names.webSearch",
            ),
          },
        },
      ),
    [files, functions, mcpServers, systemFunctions, t],
  )
}
