"use client"

import type { MinigamePlayResult } from "@chatbotx.io/business/minigame"
import { MINIGAME_PRIZE_NAME_TOKEN } from "@chatbotx.io/database/partials"
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
import { applySpintax } from "@chatbotx.io/utils/spintax"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

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

  // Memoised on the result, not computed inline, because `applySpintax` draws
  // at random: recomputing on every render would re-roll the branch while the
  // dialog animates open and the player would watch the wording change.
  // Runs before the `!result` guard so the hook order stays fixed.
  const copy = useMemo(() => {
    if (!result) {
      return null
    }

    const isPrize = result.type === "prize"
    const label = isPrize
      ? result.prize.name
      : minigame.prizeSettings.nonWinning.title
    const settings = isPrize
      ? minigame.winningMessageSettings
      : minigame.nonWinningMessageSettings
    // Spintax first, so only author copy is ever spun — a prize name carrying
    // a `{a|b}` is data and must render verbatim. Same order as the outcome
    // message the worker sends (`renderOutcomeText`).
    const render = (value: string) =>
      applySpintax(value).replaceAll(MINIGAME_PRIZE_NAME_TOKEN, label)

    return {
      isPrize,
      label,
      imageUrl: isPrize
        ? result.prize.icon.url
        : minigame.prizeSettings.nonWinning.loseImage.url,
      title: render(settings.title),
      description: render(settings.description),
    }
  }, [result, minigame])

  if (!copy) {
    return null
  }

  const { imageUrl, label, title, description } = copy
  const closeLabel = copy.isPrize
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
