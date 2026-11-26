import {
  MINIGAME_IMAGE_URL_PATHS,
  MINIGAME_PRIZE_ICON_PATH,
} from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { minigameImageSlots } from "../src/minigame/image-slots"

const row = {
  appearance: {
    backgroundImage: { url: "https://s/bg.png" },
    prizeDescriptionImage: { url: "https://s/pd.png" },
    startButtonImage: { url: "https://s/start.png" },
  },
  prizeSettings: {
    nonWinning: { loseImage: { url: "https://s/lose.png" } },
    prizes: [{ icon: { url: "https://s/p0.png" } }, { icon: { url: "" } }],
  },
}

describe("minigameImageSlots", () => {
  test("lists every image slot by stable name, skipping empty urls", () => {
    expect(minigameImageSlots(row)).toEqual([
      { slot: "background", url: "https://s/bg.png" },
      { slot: "prizeDescription", url: "https://s/pd.png" },
      { slot: "startButton", url: "https://s/start.png" },
      { slot: "loseImage", url: "https://s/lose.png" },
      { slot: "prize:0", url: "https://s/p0.png" },
    ])
  })

  test("is driven by the same paths the repository SQL checks", () => {
    // Each path the SQL checks yields exactly one slot, and nothing else does.
    const checkedPaths = [
      ...MINIGAME_IMAGE_URL_PATHS.map(
        ({ column, path }) => `${column}.${path.join(".")}`,
      ),
      `${MINIGAME_PRIZE_ICON_PATH.column}.${MINIGAME_PRIZE_ICON_PATH.arrayKey}[].${MINIGAME_PRIZE_ICON_PATH.path.join(".")}`,
    ]
    expect(checkedPaths).toEqual([
      "appearance.backgroundImage.url",
      "appearance.prizeDescriptionImage.url",
      "appearance.startButtonImage.url",
      "prizeSettings.nonWinning.loseImage.url",
      "prizeSettings.prizes[].icon.url",
    ])
    expect(new Set(minigameImageSlots(row).map(({ slot }) => slot))).toEqual(
      new Set([...MINIGAME_IMAGE_URL_PATHS.map(({ slot }) => slot), "prize:0"]),
    )
  })

  test("tolerates missing prizes", () => {
    expect(minigameImageSlots({ appearance: {}, prizeSettings: {} })).toEqual(
      [],
    )
  })
})
