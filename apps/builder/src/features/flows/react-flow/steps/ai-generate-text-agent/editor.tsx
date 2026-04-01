"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"

const AIGenerateImageEditor = () => {
  const t = useTranslations()

  return (
    <Dialog>
      <DialogTrigger>{t("actions.edit")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("flows.actions.aiGenerateTextAgent")}</DialogTitle>
          <DialogDescription />
        </DialogHeader>

        <div className="flex flex-col gap-2">wip</div>
      </DialogContent>
    </Dialog>
  )
}

export default AIGenerateImageEditor
