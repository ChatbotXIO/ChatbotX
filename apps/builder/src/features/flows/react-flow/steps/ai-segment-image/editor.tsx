"use client"

import { useTranslations } from "next-intl"
import { getAiProviderLabelKey } from "@/features/ai-agents/lib/ai-provider-label"
import { AIIcon } from "../ai-generate-text/components/ai-icon"
import { BaseStepEditor } from "../base/editor"
import { AISegmentImageDialog } from "./components/segment-image-dialog"

type AISegmentImageEditorProps = {
  parentName: string
}

export const AISegmentImageEditor = ({
  parentName,
}: AISegmentImageEditorProps) => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      iconNode={<AIIcon provider="muse" showLabel={false} />}
      title={t("fields.flows.aiSegmentImage", {
        aiName: t(getAiProviderLabelKey("muse")),
      })}
    >
      <AISegmentImageDialog parentName={parentName} />
    </BaseStepEditor>
  )
}
