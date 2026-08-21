"use client"

import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback } from "react"
import { MINIGAME_TYPE_CONFIGS } from "../constants"

type CreateMinigameTypeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
}

export function CreateMinigameTypeDialog({
  open,
  onOpenChange,
  workspaceId,
}: CreateMinigameTypeDialogProps) {
  const t = useTranslations()
  const router = useRouter()

  const handleSelect = useCallback(
    (type: string) => {
      onOpenChange(false)
      router.push(`/space/${workspaceId}/minigames/create?type=${type}`)
    },
    [onOpenChange, router, workspaceId],
  )

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("minigames.createDialog.title")}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-4">
          {MINIGAME_TYPE_CONFIGS.map((config) => (
            <Card
              aria-label={t(config.labelKey)}
              className="cursor-pointer hover:shadow-md"
              key={config.type}
              onClick={() => handleSelect(config.type)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  handleSelect(config.type)
                }
              }}
              role="button"
              tabIndex={0}
            >
              <CardContent className="flex flex-col items-center gap-3 py-6">
                <config.icon className="text-primary" size={30} />
                <span className="text-center font-medium text-sm">
                  {t(config.labelKey)}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
