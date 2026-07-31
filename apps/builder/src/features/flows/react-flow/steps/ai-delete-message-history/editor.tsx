"use client"

import { useTranslations } from "next-intl"
import { useFormContext } from "react-hook-form"
import { getAiProviderLabelKey } from "@/features/ai-agents/lib/ai-provider-label"
import { AIIcon } from "../ai-generate-text/components/ai-icon"
import { BaseStepEditor } from "../base/editor"

export const AIDeleteMessageHistoryEditor = ({
  parentName,
}: {
  parentName: string
}) => {
  const t = useTranslations()
  const { getValues } = useFormContext()
  const provider = getValues(`${parentName}.provider`) ?? "openai"

  return (
    <BaseStepEditor
      iconNode={<AIIcon provider={provider} showLabel={false} />}
      title={t("fields.flows.aiDeleteMessageHistory", {
        aiName: t(getAiProviderLabelKey(provider)),
      })}
    />
  )
}
