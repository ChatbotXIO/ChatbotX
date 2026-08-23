import type {
  MinigameAppearance,
  MinigameGeneralSettings,
  MinigameNonWinningMessageSettings,
  MinigamePlayerSettings,
  MinigamePrizeSettings,
  MinigameType,
  MinigameWinningMessageSettings,
} from "@chatbotx.io/database/partials"
import { createId } from "@chatbotx.io/utils"
import {
  CoinsIcon,
  DicesIcon,
  type LucideIcon,
  PackageIcon,
  ShuffleIcon,
  TicketIcon,
} from "lucide-react"

export const MINIGAME_TYPE_CONFIGS: {
  type: MinigameType
  labelKey: string
  icon: LucideIcon
}[] = [
  { type: "jackpot", labelKey: "minigames.types.jackpot", icon: CoinsIcon },
  {
    type: "luckyWheel",
    labelKey: "minigames.types.luckyWheel",
    icon: DicesIcon,
  },
  { type: "gashapon", labelKey: "minigames.types.gashapon", icon: PackageIcon },
  { type: "drawLots", labelKey: "minigames.types.drawLots", icon: ShuffleIcon },
  {
    type: "scratchOff",
    labelKey: "minigames.types.scratchOff",
    icon: TicketIcon,
  },
]

/** Only Jackpot has a working gameplay experience so far; the rest are disabled in the type picker. */
export const MINIGAME_TYPES_ENABLED_FOR_CREATION: MinigameType[] = ["jackpot"]

export function getDefaultMinigameGeneralSettings(): MinigameGeneralSettings {
  const now = new Date()
  const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  return {
    name: "",
    playedAtFrom: now.toISOString(),
    playedAtTo: oneWeekLater.toISOString(),
    rulesDescription: "",
    openerTagIds: [],
    playerTagIds: [],
    newFriendTagIds: [],
    shareEnabled: true,
    shareMessage: "{{shareUrl}}",
  }
}

const JACKPOT_DEFAULT_BACKGROUND_IMAGE_URL = "/mini-game/jackpot/background.svg"
const JACKPOT_DEFAULT_START_BUTTON_IMAGE_URL = "/mini-game/jackpot/button.svg"

export function getDefaultMinigameAppearance(
  type?: MinigameType,
): MinigameAppearance {
  const isJackpot = type === "jackpot"

  return {
    backgroundColor: isJackpot ? "#D4880E" : "#F5A623",
    machineColor: isJackpot ? "#D82B2B" : "#4A90D9",
    decorativeColor: isJackpot ? "#FFEA2D" : "#FFFFFF",
    ruleTextColor: isJackpot ? "#FFFFFF" : "#000000",
    backgroundImage: {
      mode: "file",
      url: isJackpot ? JACKPOT_DEFAULT_BACKGROUND_IMAGE_URL : "",
    },
    prizeDescriptionImage: { mode: "file", url: "" },
    startButtonImage: {
      mode: "file",
      url: isJackpot ? JACKPOT_DEFAULT_START_BUTTON_IMAGE_URL : "",
    },
  }
}

export function getDefaultMinigamePlayerSettings(): MinigamePlayerSettings {
  return {
    drawsPerPerson: 1,
    resetPolicy: "never",
  }
}

const DEFAULT_PRIZE_COUNT = 3

export function getDefaultMinigamePrizeSettings(): MinigamePrizeSettings {
  return {
    prizes: Array.from({ length: DEFAULT_PRIZE_COUNT }, (_, index) => ({
      id: createId(),
      name: `Prize ${index + 1}`,
      icon: { mode: "file" as const, url: "" },
      winRate: 25,
      winMessage: { enabled: false, mode: "text" as const, text: "" },
    })),
    nonWinning: {
      title: "Non-winning",
      loseRate: 25,
      loseImage: { mode: "file", url: "" },
      loseMessage: { enabled: false, mode: "text", text: "" },
    },
  }
}

export function getDefaultMinigameWinningMessageSettings(): MinigameWinningMessageSettings {
  return {
    title: "",
    description: "",
    acceptButtonText: "",
    shareButtonText: "",
    shareButtonDescription: "",
  }
}

export function getDefaultMinigameNonWinningMessageSettings(): MinigameNonWinningMessageSettings {
  return {
    title: "",
    description: "",
    shareButtonText: "",
    shareButtonDescription: "",
  }
}
