"use client"

import { ZapIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { AIModelDialog } from "../../shared/ai-model-dialog"

type DeepseekDialogProps = {
  name: string
  children?: ReactNode
  onSubmit?: () => void
}

export const DeepseekDialog = (props: DeepseekDialogProps) => {
  const { name, children, onSubmit } = props
  const t = useTranslations()

  return (
    <AIModelDialog
      icon={ZapIcon}
      iconColor="text-purple-500"
      modelLabel={t("fields.deepseek.label")}
      name={name}
      onSubmit={onSubmit}
      titleKey="fields.deepseek.label"
    >
      {children}
    </AIModelDialog>
  )
}
