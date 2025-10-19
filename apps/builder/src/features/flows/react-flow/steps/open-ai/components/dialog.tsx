"use client"

import { BotMessageSquareIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { AIModelDialog } from "../../shared/ai-model-dialog"

type OpenAIDialogProps = {
  name: string
  children?: ReactNode
  onSubmit?: () => void
}

export const OpenAIDialog = (props: OpenAIDialogProps) => {
  const { name, children, onSubmit } = props
  const t = useTranslations()

  return (
    <AIModelDialog
      icon={BotMessageSquareIcon}
      iconColor="text-gray-500"
      modelLabel={t("fields.openai.label")}
      name={t(`${name}` as keyof typeof t)}
      onSubmit={onSubmit}
      titleKey="fields.openai.label"
    >
      {children}
    </AIModelDialog>
  )
}
