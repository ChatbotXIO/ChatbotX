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

export const MINIGAME_TYPES_ENABLED_FOR_CREATION: MinigameType[] = [
  "jackpot",
  "luckyWheel",
  "gashapon",
  "drawLots",
  "scratchOff",
]

export function getDefaultMinigameGeneralSettings(): MinigameGeneralSettings {
  const now = new Date()
  const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  return {
    name: "",
    showName: false,
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
const LUCKY_WHEEL_DEFAULT_BACKGROUND_IMAGE_URL =
  "/mini-game/lucky-wheel/background.png"
const LUCKY_WHEEL_DEFAULT_START_BUTTON_IMAGE_URL =
  "/mini-game/lucky-wheel/button.png"
const GASHAPON_DEFAULT_BACKGROUND_IMAGE_URL =
  "/mini-game/gashapon/background.svg"
const GASHAPON_DEFAULT_START_BUTTON_IMAGE_URL = "/mini-game/gashapon/button.svg"
const DRAW_LOTS_DEFAULT_BACKGROUND_IMAGE_URL =
  "/mini-game/draw-lots/background.png"
const DRAW_LOTS_DEFAULT_START_BUTTON_IMAGE_URL =
  "/mini-game/draw-lots/button.png"
const SCRATCH_OFF_DEFAULT_BACKGROUND_IMAGE_URL =
  "/mini-game/scratch-off/background.png"
const SCRATCH_OFF_DEFAULT_START_BUTTON_IMAGE_URL =
  "/mini-game/scratch-off/button.png"

export function getDefaultMinigameAppearance(
  type?: MinigameType,
): MinigameAppearance {
  if (type === "jackpot") {
    return {
      backgroundColor: "#D4880E",
      machineColor: "#D82B2B",
      decorativeColor: "#FFEA2D",
      ruleTextColor: "#FFFFFF",
      backgroundImage: {
        mode: "file",
        url: JACKPOT_DEFAULT_BACKGROUND_IMAGE_URL,
      },
      prizeDescriptionImage: { mode: "file", url: "" },
      startButtonImage: {
        mode: "file",
        url: JACKPOT_DEFAULT_START_BUTTON_IMAGE_URL,
      },
    }
  }

  if (type === "luckyWheel") {
    return {
      backgroundColor: "#1B3B6F",
      machineColor: "#E63946",
      decorativeColor: "#FFD166",
      ruleTextColor: "#FFFFFF",
      backgroundImage: {
        mode: "file",
        url: LUCKY_WHEEL_DEFAULT_BACKGROUND_IMAGE_URL,
      },
      prizeDescriptionImage: { mode: "file", url: "" },
      startButtonImage: {
        mode: "file",
        url: LUCKY_WHEEL_DEFAULT_START_BUTTON_IMAGE_URL,
      },
    }
  }

  if (type === "gashapon") {
    return {
      backgroundColor: "#FFD3E0",
      machineColor: "#FF5FA2",
      decorativeColor: "#FFD23F",
      ruleTextColor: "#4A1942",
      backgroundImage: {
        mode: "file",
        url: GASHAPON_DEFAULT_BACKGROUND_IMAGE_URL,
      },
      prizeDescriptionImage: { mode: "file", url: "" },
      startButtonImage: {
        mode: "file",
        url: GASHAPON_DEFAULT_START_BUTTON_IMAGE_URL,
      },
    }
  }

  if (type === "drawLots") {
    return {
      backgroundColor: "#E8D9B5",
      machineColor: "#F5F564",
      decorativeColor: "#C9302C",
      ruleTextColor: "#FFFFFF",
      backgroundImage: {
        mode: "file",
        url: DRAW_LOTS_DEFAULT_BACKGROUND_IMAGE_URL,
      },
      prizeDescriptionImage: { mode: "file", url: "" },
      startButtonImage: {
        mode: "file",
        url: DRAW_LOTS_DEFAULT_START_BUTTON_IMAGE_URL,
      },
    }
  }

  if (type === "scratchOff") {
    return {
      backgroundColor: "#2F5FBF",
      machineColor: "#FFE629",
      decorativeColor: "#BD2000",
      ruleTextColor: "#FFFFFF",
      backgroundImage: {
        mode: "file",
        url: SCRATCH_OFF_DEFAULT_BACKGROUND_IMAGE_URL,
      },
      prizeDescriptionImage: { mode: "file", url: "" },
      startButtonImage: {
        mode: "file",
        url: SCRATCH_OFF_DEFAULT_START_BUTTON_IMAGE_URL,
      },
    }
  }

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
    // Newly created minigames get referral bonuses on by default. The Zod
    // default is deliberately `0` instead, so minigames saved before this
    // field existed stay opt-out rather than silently handing out draws.
    maxSharesPerPerson: 3,
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
    })),
    nonWinning: {
      title: "Non-winning",
      loseRate: 25,
      loseImage: { mode: "file", url: "" },
    },
    prizeNameCustomFieldId: null,
  }
}

export function getDefaultMinigameWinningMessageSettings(): MinigameWinningMessageSettings {
  return {
    title: "",
    description: "",
    acceptButtonText: "",
    shareButtonText: "",
    shareButtonDescription: "",
    outcomeMessage: { enabled: false, mode: "text", text: "" },
  }
}

export function getDefaultMinigameNonWinningMessageSettings(): MinigameNonWinningMessageSettings {
  return {
    title: "",
    description: "",
    shareButtonText: "",
    shareButtonDescription: "",
    outcomeMessage: { enabled: false, mode: "text", text: "" },
  }
}
