"use client"

import { MultiSelectField } from "@chatbotx.io/ui/components/form/multi-select-field"
import { useTranslations } from "next-intl"
import { type ComponentPropsWithoutRef, useEffect } from "react"
import { useFormContext } from "react-hook-form"
import { useAIToolMultiSelectGroups } from "../hooks/use-ai-tool-multi-select-groups"
import { useAIToolsStore } from "../provider/ai-tools-store-context"

type AIToolMultiSelectProps = Omit<
  ComponentPropsWithoutRef<typeof MultiSelectField>,
  "options"
>

export const AIToolMultiSelect = ({
  label,
  placeholder,
  name,
  ...props
}: AIToolMultiSelectProps) => {
  const t = useTranslations()
  const files = useAIToolsStore((store) => store.files)
  const functions = useAIToolsStore((store) => store.functions)
  const mcpServers = useAIToolsStore((store) => store.mcpServers)
  const systemFunctions = useAIToolsStore((store) => store.systemFunctions)
  const initialized = useAIToolsStore((store) => store.initialized)
  const { getValues, setValue } = useFormContext()

  const toolOptions = useAIToolMultiSelectGroups({
    files,
    functions,
    mcpServers,
    systemFunctions,
  })

  useEffect(() => {
    if (!initialized) {
      return
    }
    if (!name) {
      return
    }

    const allOptionValues = new Set(
      toolOptions.flatMap((group) => group.options.map((o) => o.value)),
    )
    const currentTools = (getValues(name) as string[]) ?? []
    const validTools = currentTools.filter((tool) => allOptionValues.has(tool))

    if (validTools.length < currentTools.length) {
      setValue(name, validTools, { shouldValidate: true, shouldDirty: true })
    }
  }, [initialized, toolOptions, name, getValues, setValue])

  return (
    <MultiSelectField
      label={label ?? t("fields.tools.label")}
      name={name}
      options={toolOptions}
      placeholder={placeholder ?? t("fields.tools.placeholder")}
      {...props}
    />
  )
}
