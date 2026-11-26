import {
  MINIGAME_IMAGE_URL_PATHS,
  MINIGAME_PRIZE_ICON_PATH,
} from "@chatbotx.io/database/partials"

/** The JSON columns of a minigame that hold images. */
export type MinigameImageSource = {
  appearance: unknown
  prizeSettings: unknown
}

export type MinigameImageSlot = {
  /** Stable name of the slot: `background`, `loseImage`, `prize:0`, … */
  slot: string
  url: string
}

const readPath = (value: unknown, path: readonly string[]): unknown =>
  path.reduce<unknown>(
    (current, key) =>
      current !== null && typeof current === "object"
        ? (current as Record<string, unknown>)[key]
        : undefined,
    value,
  )

const asUrl = (value: unknown): string =>
  typeof value === "string" ? value : ""

/**
 * Every image a minigame points at, by stable slot name, in one place for the
 * template adapters: staging keys its objects by `slot`, uninstall cleanup
 * deletes by `url`. The paths come from the same constants as the SQL in
 * `minigameRepository.findImageUrlsUsedByOthers`, so the two cannot drift.
 * Slots with no url are omitted.
 */
export const minigameImageSlots = (
  row: MinigameImageSource,
): MinigameImageSlot[] => {
  const fixed = MINIGAME_IMAGE_URL_PATHS.map(
    ({ slot, column, path }): MinigameImageSlot => ({
      slot,
      url: asUrl(readPath(row[column], path)),
    }),
  )
  const prizes = readPath(row[MINIGAME_PRIZE_ICON_PATH.column], [
    MINIGAME_PRIZE_ICON_PATH.arrayKey,
  ])
  const icons = Array.isArray(prizes)
    ? prizes.map(
        (prize, index): MinigameImageSlot => ({
          slot: `prize:${index}`,
          url: asUrl(readPath(prize, MINIGAME_PRIZE_ICON_PATH.path)),
        }),
      )
    : []
  return [...fixed, ...icons].filter(({ url }) => url !== "")
}
