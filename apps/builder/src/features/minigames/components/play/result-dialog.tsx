"use client"

import type { MinigamePlayResult } from "@chatbotx.io/business/minigame"
import type { MinigameModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { useTranslations } from "next-intl"

type ResultDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: MinigamePlayResult | null
  minigame: MinigameModel
}

export function ResultDialog({
  open,
  onOpenChange,
  result,
  minigame,
}: ResultDialogProps) {
  const t = useTranslations()

  if (!result) {
    return null
  }

  const isPrize = result.type === "prize"
  const imageUrl = isPrize
    ? result.prize.icon.url
    : minigame.prizeSettings.nonWinning.loseImage.url
  const label = isPrize
    ? result.prize.name
    : minigame.prizeSettings.nonWinning.title
  const title = (
    isPrize
      ? minigame.winningMessageSettings.title
      : minigame.nonWinningMessageSettings.title
  ).replaceAll("{{prize_name}}", label)
  const description = (
    isPrize
      ? minigame.winningMessageSettings.description
      : minigame.nonWinningMessageSettings.description
  ).replaceAll("{{prize_name}}", label)
  const closeLabel = isPrize
    ? minigame.winningMessageSettings.acceptButtonText ||
      t("minigames.play.close")
    : t("minigames.play.close")

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader className="items-center">
          {imageUrl && (
            // biome-ignore lint/performance/noImgElement: previewing a workspace-uploaded prize image, not an optimizable static asset
            <img
              alt={label}
              className="size-24 object-contain"
              height={96}
              src={imageUrl}
              width={96}
            />
          )}
          {title && <DialogTitle className="text-xl">{title}</DialogTitle>}
          {description && <DialogDescription>{description}</DialogDescription>}
          <span className="font-extrabold text-2xl text-foreground">
            {label}
          </span>
        </DialogHeader>
        <DialogFooter className="justify-center sm:justify-center">
          <DialogClose render={<Button type="button">{closeLabel}</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
