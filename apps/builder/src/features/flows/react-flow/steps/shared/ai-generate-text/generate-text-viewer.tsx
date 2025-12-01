"use client"

import type { LucideIcon } from "lucide-react"
import { useTranslations } from "next-intl"

type GenerateTextViewerProps = {
  icon: LucideIcon
  iconColor: string
  modelLabelKey: string
}

export const GenerateTextViewer = (props: GenerateTextViewerProps) => {
  const { icon: Icon, iconColor, modelLabelKey } = props
  const t = useTranslations()

  return (
    <div className="flex w-full items-center justify-center gap-2 py-4 text-center font-bold">
      <Icon className={iconColor} size={18} />
      {t("fields.flows.aiGenerateText.label", {
        aiName: t(modelLabelKey),
      })}
    </div>
  )
}
