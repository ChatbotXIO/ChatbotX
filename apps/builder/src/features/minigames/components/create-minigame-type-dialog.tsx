"use client"

import { JackpotMachineArt } from "@chatbotx.io/minigame-ui"
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
import type { KeyboardEvent } from "react"
import { useCallback } from "react"
import {
  getDefaultMinigameAppearance,
  MINIGAME_TYPE_CONFIGS,
  MINIGAME_TYPES_ENABLED_FOR_CREATION,
} from "../constants"

const JACKPOT_PREVIEW_APPEARANCE = getDefaultMinigameAppearance("jackpot")

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
            const isJackpot = config.type === "jackpot"

            const cardButtonProps = {
              "aria-disabled": !isEnabled,
              "aria-label": t(config.labelKey),
              onClick: isEnabled ? () => handleSelect(config.type) : undefined,
              onKeyDown: isEnabled
                ? (event: KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      handleSelect(config.type)
                    }
                  }
                : undefined,
              role: "button" as const,
              tabIndex: isEnabled ? 0 : -1,
            }

            if (isJackpot) {
              return (
                <Card
                  className={cn(
                    "relative h-44 w-36 overflow-hidden p-0",
                    isEnabled
                      ? "cursor-pointer hover:shadow-md"
                      : "cursor-not-allowed opacity-50",
                  )}
                  key={config.type}
                  {...cardButtonProps}
                >
                  <CardContent
                    className="relative flex h-full w-full items-center justify-center bg-center bg-cover p-0"
                    style={{
                      backgroundColor:
                        JACKPOT_PREVIEW_APPEARANCE.backgroundColor,
                      backgroundImage: JACKPOT_PREVIEW_APPEARANCE
                        .backgroundImage.url
                        ? `url(${JACKPOT_PREVIEW_APPEARANCE.backgroundImage.url})`
                        : undefined,
                    }}
                  >
                    <div className="w-20">
                      <JackpotMachineArt
                        decorativeColor={
                          JACKPOT_PREVIEW_APPEARANCE.decorativeColor
                        }
                        machineColor={JACKPOT_PREVIEW_APPEARANCE.machineColor}
                      />
                    </div>

                    <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 to-transparent px-2 pt-8 pb-2">
                      <span className="block text-center font-medium text-sm text-white">
                        {t(config.labelKey)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            }

            return (
              <Card
                className={cn(
                  "h-44 w-36",
                  isEnabled
                    ? "cursor-pointer hover:shadow-md"
                    : "cursor-not-allowed opacity-50",
                )}
                key={config.type}
                {...cardButtonProps}
              >
                <CardContent className="flex h-full flex-col items-center justify-center gap-3">
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
