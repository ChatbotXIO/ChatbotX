"use client"

import type {
  MinigameAppearance,
  MinigamePrizeSettings,
  MinigameType,
} from "@chatbotx.io/database/partials"
import {
  JackpotMachineArt,
  LuckyWheelArt,
  type LuckyWheelSegment,
} from "@chatbotx.io/minigame-ui"
import type { ComponentType, ReactNode } from "react"
import { getDefaultMinigameAppearance } from "../../constants"
import { JackpotPreview } from "./jackpot-preview"
import { LuckyWheelPreview } from "./lucky-wheel-preview"

export type MinigamePreviewProps = {
  type: MinigameType
  name: string
  showName: boolean
  rulesDescription: string
  appearance: MinigameAppearance
  prizeSettings: MinigamePrizeSettings
  shareEnabled: boolean
}

/** Full admin-preview components, keyed by type — types without an entry fall back to `GenericMinigamePreview`. */
export const MINIGAME_PREVIEW_COMPONENTS: Partial<
  Record<MinigameType, ComponentType<MinigamePreviewProps>>
> = {
  jackpot: JackpotPreview,
  luckyWheel: LuckyWheelPreview,
}

type MinigameTypeCardArt = {
  backgroundColor: string
  backgroundImageUrl: string
  art: ReactNode
}

const JACKPOT_PREVIEW_APPEARANCE = getDefaultMinigameAppearance("jackpot")
const LUCKY_WHEEL_PREVIEW_APPEARANCE =
  getDefaultMinigameAppearance("luckyWheel")

const LUCKY_WHEEL_PREVIEW_SEGMENT_COUNT = 6
const LUCKY_WHEEL_PREVIEW_SEGMENTS: LuckyWheelSegment[] = Array.from(
  { length: LUCKY_WHEEL_PREVIEW_SEGMENT_COUNT },
  (_, index) => ({ id: `preview-${index}`, label: "", iconUrl: "" }),
)

/** Mini-card art for the "Choose a minigame type" dialog — types without an entry fall back to a generic icon card. */
export const MINIGAME_TYPE_CARD_ART: Partial<
  Record<MinigameType, MinigameTypeCardArt>
> = {
  jackpot: {
    backgroundColor: JACKPOT_PREVIEW_APPEARANCE.backgroundColor,
    backgroundImageUrl: JACKPOT_PREVIEW_APPEARANCE.backgroundImage.url,
    art: (
      <JackpotMachineArt
        decorativeColor={JACKPOT_PREVIEW_APPEARANCE.decorativeColor}
        machineColor={JACKPOT_PREVIEW_APPEARANCE.machineColor}
      />
    ),
  },
  luckyWheel: {
    backgroundColor: LUCKY_WHEEL_PREVIEW_APPEARANCE.backgroundColor,
    backgroundImageUrl: LUCKY_WHEEL_PREVIEW_APPEARANCE.backgroundImage.url,
    art: (
      <LuckyWheelArt
        decorativeColor={LUCKY_WHEEL_PREVIEW_APPEARANCE.decorativeColor}
        machineColor={LUCKY_WHEEL_PREVIEW_APPEARANCE.machineColor}
        rotationDeg={0}
        segments={LUCKY_WHEEL_PREVIEW_SEGMENTS}
        transitionDurationMs={0}
        transitionEasing="none"
      />
    ),
  },
}
