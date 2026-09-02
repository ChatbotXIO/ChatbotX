"use client"

import type {
  MinigameAppearance,
  MinigamePrizeSettings,
} from "@chatbotx.io/database/partials"
import { JackpotStartButton, LuckyWheelArt } from "@chatbotx.io/minigame-ui"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Share2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { buildLuckyWheelSegments } from "../../lib/lucky-wheel-segments"
import { MinigamePreviewLayout } from "./minigame-preview-layout"

type LuckyWheelPreviewProps = {
  name: string
  showName: boolean
  rulesDescription: string
  appearance: MinigameAppearance
  prizeSettings: MinigamePrizeSettings
  shareEnabled: boolean
}

export function LuckyWheelPreview({
  name,
  showName,
  rulesDescription,
  appearance,
  prizeSettings,
  shareEnabled,
}: LuckyWheelPreviewProps) {
  const t = useTranslations()
  const segments = useMemo(
    () => buildLuckyWheelSegments(prizeSettings),
    [prizeSettings],
  )

  return (
    <MinigamePreviewLayout
      appearance={appearance}
      art={
        <LuckyWheelArt
          decorativeColor={appearance.decorativeColor}
          machineColor={appearance.machineColor}
          rotationDeg={0}
          segments={segments}
          transitionDurationMs={0}
          transitionEasing="none"
        />
      }
      name={name || t("minigames.preview.luckyWheelHeader")}
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
