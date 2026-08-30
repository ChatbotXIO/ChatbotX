"use client"

import type {
  MinigameAppearance,
  MinigamePrizeSettings,
} from "@chatbotx.io/database/partials"
import {
  GashaponMachineArt,
  JackpotStartButton,
} from "@chatbotx.io/minigame-ui"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Share2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { MinigamePreviewLayout } from "./minigame-preview-layout"

type GashaponPreviewProps = {
  name: string
  showName: boolean
  rulesDescription: string
  appearance: MinigameAppearance
  prizeSettings: MinigamePrizeSettings
  shareEnabled: boolean
}

export function GashaponPreview({
  name,
  showName,
  rulesDescription,
  appearance,
  shareEnabled,
}: GashaponPreviewProps) {
  const t = useTranslations()

  return (
    <MinigamePreviewLayout
      appearance={appearance}
      art={
        <GashaponMachineArt
          decorativeColor={appearance.decorativeColor}
          machineColor={appearance.machineColor}
          phase="idle"
        />
      }
      name={name || t("minigames.preview.gashaponHeader")}
      prizeDescriptionImageUrl={appearance.prizeDescriptionImage.url}
      rulesDescription={rulesDescription}
      shareButton={
        shareEnabled && (
          <button
            className={cn(
              "flex items-center gap-1.5 text-foreground/80 text-xs underline-offset-2 hover:underline",
            )}
            type="button"
          >
            <Share2Icon className="size-3.5" />
            {t("minigames.preview.shareWithFriends")}
          </button>
        )
      }
      showName={showName}
      startButton={
        <JackpotStartButton
          label={t("minigames.preview.start")}
          startButtonImageUrl={appearance.startButtonImage.url}
        />
      }
    />
  )
}
