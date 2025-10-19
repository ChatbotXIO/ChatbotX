"use client"

import { BrainIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { AIModelDialog } from "../../shared/ai-model-dialog"

type GeminiDialogProps = {
  name: string
  children?: ReactNode
  onSubmit?: () => void
}

export const GeminiDialog = (props: GeminiDialogProps) => {
  const { name, children, onSubmit } = props
  const t = useTranslations()

  return (
    <AIModelDialog
      icon={BrainIcon}
      iconColor="text-blue-500"
      modelLabel={t("fields.gemini.label")}
      name={t(`${name}` as keyof typeof t)}
      onSubmit={onSubmit}
      titleKey="fields.gemini.label"
    >
      {children}
    </AIModelDialog>
  )
}
