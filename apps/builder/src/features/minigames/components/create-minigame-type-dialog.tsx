"use client"

import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useCallback } from "react"
import {
  MINIGAME_TYPE_CONFIGS,
  MINIGAME_TYPES_ENABLED_FOR_CREATION,
} from "../constants"

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
      {/* 5 cards (144px) + 4 gaps (16px) + dialog padding (16px each side) = 816px minimum;
          sized wider (w-220 = 880px) so it isn't a knife-edge fit against rounding. */}
      <DialogContent className="w-220 sm:max-w-none">
        <DialogHeader>
          <DialogTitle>{t("minigames.createDialog.title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap justify-center gap-4">
          {MINIGAME_TYPE_CONFIGS.map((config) => {
            const isEnabled = MINIGAME_TYPES_ENABLED_FOR_CREATION.includes(
              config.type,
            )

            return (
              <Card
                aria-disabled={!isEnabled}
                aria-label={t(config.labelKey)}
                className={cn(
                  "w-36",
                  isEnabled
                    ? "cursor-pointer hover:shadow-md"
                    : "cursor-not-allowed opacity-50",
                )}
                key={config.type}
                onClick={
                  isEnabled ? () => handleSelect(config.type) : undefined
                }
                onKeyDown={
                  isEnabled
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault()
                          handleSelect(config.type)
                        }
                      }
                    : undefined
                }
                role="button"
                tabIndex={isEnabled ? 0 : -1}
              >
                <CardContent className="flex flex-col items-center gap-3 py-6">
                  <config.icon className="text-primary" size={30} />
                  <span className="text-center font-medium text-sm">
                    {t(config.labelKey)}
                  </span>
                  {!isEnabled && (
                    <span className="text-muted-foreground text-xs">
                      {t("minigames.createDialog.comingSoon")}
                    </span>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
