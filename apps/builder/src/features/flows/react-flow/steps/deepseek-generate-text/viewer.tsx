"use client"

import { ZapIcon } from "lucide-react"
import { useTranslations } from "next-intl"

export const DeepseekGenerateTextViewer = () => {
  const t = useTranslations()

  return (
    <div className="flex w-full items-center justify-center gap-2 py-4 text-center font-bold">
      <ZapIcon className="text-purple-500" size={18} />
      {t("flows.stepType.deepseekGenerateText")}
    </div>
  )
}
