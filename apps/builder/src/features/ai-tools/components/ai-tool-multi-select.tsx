"use client"

import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { useTranslations } from "next-intl"
import type { ComponentPropsWithoutRef } from "react"
import { useAIToolMultiSelectGroups } from "../hooks/use-ai-tool-multi-select-groups"
import { useAIToolsStore } from "../provider/ai-tools-store-context"

type AIToolMultiSelectProps = Omit<
  ComponentPropsWithoutRef<typeof MultiSelectField>,
  "options"
>

export const AIToolMultiSelect = ({
  label,
  placeholder,
  ...props
}: AIToolMultiSelectProps) => {
  const t = useTranslations()
  const { files, functions, mcpServers, systemFunctions } = useAIToolsStore(
    (store) => store,
  )

  const toolOptions = useAIToolMultiSelectGroups({
    files,
    functions,
    mcpServers,
    systemFunctions,
  })

  return (
    <MultiSelectField
      label={label ?? t("fields.tools.label")}
      options={toolOptions}
      placeholder={placeholder ?? t("fields.tools.placeholder")}
      {...props}
    />
  )
}
