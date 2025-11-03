"use client"

import { BotIcon } from "lucide-react"
import { useTranslations } from "next-intl"

const AISpeechToTextViewer = () => {
  const t = useTranslations()
  return (
    <div className="flex w-full items-center justify-center gap-2 py-4 text-center font-bold">
      <BotIcon className="text-yellow-500" size={18} />
      {t("flows.actions.aiSpeechToText")}
    </div>
  )
}

export default AISpeechToTextViewer
