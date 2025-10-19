"use client"

import { CpuIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { AIModelDialog } from "../../shared/ai-model-dialog"

type ClaudeDialogProps = {
  name: string
  children?: ReactNode
  onSubmit?: () => void
}

export const ClaudeDialog = (props: ClaudeDialogProps) => {
  const { name, children, onSubmit } = props
  const t = useTranslations()

  return (
    <AIModelDialog
      icon={CpuIcon}
      iconColor="text-orange-500"
      modelLabel={t("fields.claude.label")}
      name={t(`${name}` as keyof typeof t)}
      onSubmit={onSubmit}
      titleKey="fields.claude.label"
    >
      {children}
    </AIModelDialog>
  )
}
