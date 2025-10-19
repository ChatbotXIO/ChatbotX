"use client"

import { BrainIcon } from "lucide-react"
import { useTranslations } from "next-intl"

export const GeminiGenerateTextViewer = () => {
  const t = useTranslations()

  return (
    <div className="flex w-full items-center justify-center gap-2 py-4 text-center font-bold">
      <BrainIcon className="text-blue-500" size={18} />
      {t("flows.stepType.geminiGenerateText")}
    </div>
  )
}
