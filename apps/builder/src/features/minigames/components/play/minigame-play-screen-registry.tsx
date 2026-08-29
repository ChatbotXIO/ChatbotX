import type { MinigameType } from "@chatbotx.io/database/partials"
import type {
  MinigameContactModel,
  MinigameModel,
} from "@chatbotx.io/database/types"
import type { ComponentType } from "react"
import { JackpotPlayScreen } from "./jackpot-play-screen"
import { LuckyWheelPlayScreen } from "./lucky-wheel-play-screen"

export type MinigamePlayScreenProps = {
  minigame: MinigameModel
  contactState: MinigameContactModel
  token: string
}

export const MINIGAME_PLAY_SCREENS: Partial<
  Record<MinigameType, ComponentType<MinigamePlayScreenProps>>
> = {
  jackpot: JackpotPlayScreen,
  luckyWheel: LuckyWheelPlayScreen,
}
