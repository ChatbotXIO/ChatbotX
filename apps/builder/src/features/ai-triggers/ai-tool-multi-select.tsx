"use client"

import { MultiSelectField } from "@aha.chat/ui/components/form/multi-select-field"
import { FileIcon, FunctionSquareIcon, ServerIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo } from "react"
import { useAITools } from "./use-ai-tools"

type AIToolMultiSelectProps = {
  name: string
  isRequired?: boolean
}

export function AIToolMultiSelect(props: AIToolMultiSelectProps) {
  const t = useTranslations()
  const { toolOptions, loading, error, fetchTools, hasData } = useAITools()

  // Fetch data when component mounts (when popup opens)
  useEffect(() => {
    if (hasData || loading) {
      return
    }
    fetchTools()
  }, [hasData, loading, fetchTools])

  const toolOptionsWithIcons = useMemo(
    () => [
      {
        heading: t("fields.file.label"),
        options:
          toolOptions[0]?.options.map((option) => ({
            ...option,
            icon: FileIcon,
          })) || [],
      },
      {
        heading: t("fields.function.label"),
        options:
          toolOptions[1]?.options.map((option) => ({
            ...option,
            icon: FunctionSquareIcon,
          })) || [],
      },
      {
        heading: t("fields.mcpServer.label"),
        options:
          toolOptions[2]?.options.map((option) => ({
            ...option,
            icon: ServerIcon,
          })) || [],
      },
    ],
    [toolOptions, t],
  )

  return (
    <MultiSelectField
      disabled={loading || !!error}
      label={t("fields.tools.label")}
      options={toolOptionsWithIcons}
      placeholder={
        loading
          ? t("fields.placeholders.loading")
          : t("fields.placeholders.selectTools")
      }
      {...props}
    />
  )
}
