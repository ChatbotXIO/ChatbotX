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
  {
    type: "luckyWheel",
    labelKey: "minigames.types.luckyWheel",
    icon: DicesIcon,
  },
  { type: "jackpot", labelKey: "minigames.types.jackpot", icon: CoinsIcon },
  { type: "gashapon", labelKey: "minigames.types.gashapon", icon: PackageIcon },
  { type: "drawLots", labelKey: "minigames.types.drawLots", icon: ShuffleIcon },
  {
    type: "scratchOff",
    labelKey: "minigames.types.scratchOff",
    icon: TicketIcon,
  },
]

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

export function getDefaultMinigameAppearance(): MinigameAppearance {
  return {
    backgroundColor: "#F5A623",
    machineColor: "#4A90D9",
    decorativeColor: "#FFFFFF",
    ruleTextColor: "#000000",
    backgroundImage: { mode: "file", url: "" },
    prizeDescriptionImage: { mode: "file", url: "" },
    startButtonImage: { mode: "file", url: "" },
  }
}

export function getDefaultMinigamePlayerSettings(): MinigamePlayerSettings {
  return {
    drawsPerPerson: 1,
    resetPolicy: "never",
  }
}

export function getDefaultMinigamePrizeSettings(): MinigamePrizeSettings {
  return {
    prizes: [
      {
        id: createId(),
        name: "Prize 1",
        icon: { mode: "file", url: "" },
        winRate: 25,
      },
      {
        id: createId(),
        name: "Prize 2",
        icon: { mode: "file", url: "" },
        winRate: 25,
      },
      {
        id: createId(),
        name: "Prize 3",
        icon: { mode: "file", url: "" },
        winRate: 25,
      },
    ],
    nonWinning: {
      title: "Non-winning setting",
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
