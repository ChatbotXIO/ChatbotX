import Emoji, {
  type EmojiItem,
  type EmojiOptions,
  gitHubEmojis,
} from "@tiptap/extension-emoji"
import type { DOMOutputSpec } from "@tiptap/pm/model"

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

// `@tiptap/extension-emoji` 3.26.0 `emojiToShortcode` strips one variation
// selector (`\uFE0F` / `\uFE0E`) and then compares that string to `item.emoji`
// with `===`. The catalogue character has to stay unqualified (`❤`, `1⃣`) or
// both `❤` and `❤️` miss and stay plain text. `renderText` / `renderHTML` are
// what `getText()` and the DOM use, so only those emit the fully-qualified
// character taken from the Apple fallback image.
//
// Keys follow `shortcodeToEmoji`: the first catalogue row that owns a name or
// shortcode wins. A later row must not qualify `sunglasses` into dark
// sunglasses just because that row's shortcode is `sunglasses`.
const claimedAttributes = new Set<string>()
const qualifiedEmojiByAttribute = new Map<string, string>()

for (const item of gitHubEmojis) {
  const qualified = item.emoji ? withFullyQualifiedEmoji(item).emoji : undefined
  const override =
    item.emoji && qualified && qualified !== item.emoji ? qualified : undefined

  for (const attribute of [item.name, ...item.shortcodes]) {
    if (claimedAttributes.has(attribute)) {
      continue
    }
    claimedAttributes.add(attribute)
    if (override) {
      qualifiedEmojiByAttribute.set(attribute, override)
    }
  }
}

const attributeName = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined

const qualifiedEmojiForAttribute = (
  name: string | undefined,
): string | undefined =>
  name ? qualifiedEmojiByAttribute.get(name) : undefined

const withQualifiedText = (
  rendered: DOMOutputSpec,
  qualified: string | undefined,
): DOMOutputSpec => {
  if (!(qualified && Array.isArray(rendered))) {
    return rendered
  }

  const [tag, attributes, content, ...rest] = rendered
  if (typeof content !== "string" || rest.length > 0) {
    return rendered
  }

  return [tag, attributes, qualified]
}

const FlowEditorEmoji = Emoji.extend({
  renderText(props) {
    const qualified = qualifiedEmojiForAttribute(
      attributeName(props.node.attrs.name),
    )
    if (qualified) {
      return qualified
    }

    return (
      this.parent?.(props) ??
      `:${attributeName(props.node.attrs.name) ?? "emoji"}:`
    )
  },

  renderHTML(props) {
    const rendered = this.parent?.(props) ?? [
      "span",
      props.HTMLAttributes,
      `:${attributeName(props.node.attrs.name) ?? "emoji"}:`,
    ]

    return withQualifiedText(
      rendered,
      qualifiedEmojiForAttribute(attributeName(props.node.attrs.name)),
    )
  },
})

export const configureFlowEditorEmoji = (
  suggestion: EmojiOptions["suggestion"],
) =>
  FlowEditorEmoji.configure({
    emojis: gitHubEmojis,
    enableEmoticons: true,
    suggestion,
  })
