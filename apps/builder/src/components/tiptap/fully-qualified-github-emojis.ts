import { type EmojiItem, gitHubEmojis } from "@tiptap/extension-emoji"

const VARIATION_SELECTOR_16 = 0xfe_0f
const MAX_UNICODE_CODE_POINT = 0x10_ff_ff
const CODEPOINT_FILENAME = /^[0-9a-f]+(?:-[0-9a-f]+)*$/i
const FILE_EXTENSION = /\.[^.]+$/

const codePointsOf = (value: string): number[] => {
  const points: number[] = []
  for (const char of value) {
    const point = char.codePointAt(0)
    if (point !== undefined) {
      points.push(point)
    }
  }
  return points
}

const withoutVariationSelector = (points: number[]): number[] =>
  points.filter((point) => point !== VARIATION_SELECTOR_16)

const variationSelectorCount = (points: number[]): number =>
  points.filter((point) => point === VARIATION_SELECTOR_16).length

const sameCodePoints = (left: number[], right: number[]): boolean =>
  left.length === right.length &&
  left.every((point, index) => point === right[index])

// Apple emoji file names are the fully-qualified code points, e.g.
// `0031-fe0f-20e3.png`. Names that are not hex sequences (GitHub custom
// emoji such as `trollface.png`) are left alone.
const emojiFromFallbackImage = (fallbackImage: string): string | undefined => {
  const fileName = fallbackImage.split("/").pop()?.replace(FILE_EXTENSION, "")
  if (!(fileName && CODEPOINT_FILENAME.test(fileName))) {
    return
  }

  const codePoints = fileName
    .split("-")
    .map((part) => Number.parseInt(part, 16))
  if (
    codePoints.some(
      (point) =>
        !Number.isInteger(point) || point < 0 || point > MAX_UNICODE_CODE_POINT,
    )
  ) {
    return
  }

  return String.fromCodePoint(...codePoints)
}

const withFullyQualifiedEmoji = (item: EmojiItem): EmojiItem => {
  if (!(item.emoji && item.fallbackImage)) {
    return item
  }

  const qualified = emojiFromFallbackImage(item.fallbackImage)
  if (!qualified || qualified === item.emoji) {
    return item
  }

  const currentPoints = codePointsOf(item.emoji)
  const qualifiedPoints = codePointsOf(qualified)
  const onlyInsertsVariationSelector =
    sameCodePoints(
      withoutVariationSelector(currentPoints),
      withoutVariationSelector(qualifiedPoints),
    ) &&
    variationSelectorCount(qualifiedPoints) >=
      variationSelectorCount(currentPoints)

  if (!onlyInsertsVariationSelector) {
    return item
  }

  return { ...item, emoji: qualified }
}

// `gitHubEmojis` stores keycaps, hearts, warnings and arrows without U+FE0F
// (`1⃣`, `❤`, `⚠`) while `fallbackImage` names the fully-qualified sequence.
// `@tiptap/extension-emoji` matches the typed sequence, then `renderText`
// returns that list character, so `getText()` drops the variation selector.
export const fullyQualifiedGitHubEmojis: EmojiItem[] = gitHubEmojis.map(
  withFullyQualifiedEmoji,
)
