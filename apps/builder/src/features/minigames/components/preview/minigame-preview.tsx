"use client"

import type {
  MinigameAppearance,
  MinigamePrizeSettings,
  MinigameType,
} from "@chatbotx.io/database/partials"
import { GenericMinigamePreview } from "./generic-minigame-preview"
import { JackpotPreview } from "./jackpot-preview"

type MinigamePreviewProps = {
  type: MinigameType
  name: string
  appearance: MinigameAppearance
  prizeSettings: MinigamePrizeSettings
  shareEnabled: boolean
}

export function MinigamePreview(props: MinigamePreviewProps) {
  if (props.type === "jackpot") {
    return <JackpotPreview {...props} />
  }
  return <GenericMinigamePreview {...props} />
}
