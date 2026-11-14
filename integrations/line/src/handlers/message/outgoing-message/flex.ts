import { type ButtonStyle, LINE_BUTTON_STYLES } from "@chatbotx.io/flow-config"
import type { LineAction, LineButton } from "./actions"
import { LINE_LIMITS, truncate } from "./limits"

/**
 * LINE Flex Messages: the only way this integration sends buttons in a
 * message body. Every button-bearing message (text, card, carousel card, the
 * buttons after a media step) is built by {@link flexBubbles} and wrapped by
 * {@link flexMessages}; quick replies are the only other place actions go.
 *
 * Only components that work in every LINE version are used (no `maxWidth`,
 * `lineSpacing`, video, `scaling`, …), and bubble `size` is left at its
 * default so every bubble of a carousel has the same width.
 */

declare const nonEmptyText: unique symbol
/** Text that is not blank. Only `flexText` makes one: LINE rejects an empty text component. */
export type NonEmptyText = string & { readonly [nonEmptyText]: true }

/** At least one item: LINE rejects an empty box or carousel. */
export type NonEmptyArray<T> = readonly [T, ...T[]]

/**
 * Style of a button whose author picked none: the LINE flow policy's default
 * (LINE's own, `link`). Applied in {@link flexBubbles} only; an author's choice
 * travels on each button (`LineButton.style`).
 */
export const DEFAULT_LINE_BUTTON_STYLE: ButtonStyle = LINE_BUTTON_STYLES.default

export type FlexText = {
  type: "text"
  text: NonEmptyText
  wrap: true
  weight?: "bold"
  size?: "sm" | "md"
}

export type FlexImage = {
  type: "image"
  url: string
  size: "full"
  aspectRatio: "20:13"
  aspectMode: "cover"
}

/** `style` is required so no button goes out with an implicit style. */
export type FlexButton = {
  type: "button"
  action: LineAction
  style: ButtonStyle
}

export type FlexBox<T extends FlexText | FlexButton> = {
  type: "box"
  layout: "vertical"
  spacing: "sm"
  contents: NonEmptyArray<T>
}

type BubbleSections = {
  hero?: FlexImage
  body?: FlexBox<FlexText>
  footer?: FlexBox<FlexButton>
}

/** A bubble always has at least one of hero, body and footer. */
export type FlexBubble = { type: "bubble" } & BubbleSections &
  (
    | { hero: FlexImage }
    | { body: FlexBox<FlexText> }
    | { footer: FlexBox<FlexButton> }
  )

export type FlexCarousel = {
  type: "carousel"
  contents: NonEmptyArray<FlexBubble>
}

export type FlexMessage = {
  type: "flex"
  altText: string
  contents: FlexBubble | FlexCarousel
}

/** What one bubble shows; every part is optional except the action list. */
export type BubbleContent = {
  /** Hero image (HTTPS, JPEG/PNG). */
  imageUrl?: string
  /** Bold first line (a card's title). */
  title?: string
  /** Small line under the title (a card's subtitle). */
  subtitle?: string
  /** Regular body text (a text step's message). */
  text?: string
  /**
   * Rendered in order as the footer buttons, capped at `maxButtons`, each in
   * its own style (unset means {@link DEFAULT_LINE_BUTTON_STYLE}).
   */
  buttons: LineButton[]
  /**
   * How many of `buttons` to render: `LINE_LIMITS.stepButtons` for a step,
   * `LINE_LIMITS.cardButtons` for a card. Required so a caller picks the
   * limit of its own container.
   */
  maxButtons: number
}

/** Used only when every candidate alt text is blank (LINE requires one). */
const FALLBACK_ALT_TEXT = "-"

const TEXT_STYLE = {
  title: { weight: "bold", size: "md" },
  subtitle: { size: "sm" },
  body: {},
} as const satisfies Record<string, Pick<FlexText, "weight" | "size">>

type TextRole = keyof typeof TEXT_STYLE

const encoder = new TextEncoder()

/** Size LINE measures a flex payload by: its serialized JSON in UTF-8 bytes. */
export const jsonBytes = (value: unknown): number =>
  encoder.encode(JSON.stringify(value)).length

const nonEmpty = <T>(items: readonly T[]): NonEmptyArray<T> | null => {
  const [first, ...rest] = items
  return first === undefined ? null : [first, ...rest]
}

const flexText = (
  value: string | undefined,
  role: TextRole,
): FlexText | null =>
  value?.trim()
    ? {
        type: "text",
        text: value as NonEmptyText,
        wrap: true,
        ...TEXT_STYLE[role],
      }
    : null

const heroImage = (url: string): FlexImage => ({
  type: "image",
  url,
  size: "full",
  aspectRatio: "20:13",
  aspectMode: "cover",
})

/** The one renderer of a button in a message body. */
const flexButton = (action: LineAction, style: ButtonStyle): FlexButton => ({
  type: "button",
  action,
  style,
})

const box = <T extends FlexText | FlexButton>(
  items: ReadonlyArray<T | null>,
): FlexBox<T> | undefined => {
  const contents = nonEmpty(items.filter((item): item is T => item !== null))
  return contents
    ? { type: "box", layout: "vertical", spacing: "sm", contents }
    : undefined
}

const bubble = ({ hero, body, footer }: BubbleSections): FlexBubble | null => {
  const withFooter = footer ? { footer } : {}
  if (hero) {
    return { type: "bubble", hero, ...(body ? { body } : {}), ...withFooter }
  }
  if (body) {
    return { type: "bubble", body, ...withFooter }
  }
  return footer ? { type: "bubble", footer } : null
}

const fitsBubble = (value: FlexBubble): boolean =>
  jsonBytes(value) <= LINE_LIMITS.bubbleBytes

/** A bubble for one button that did not fit its message: its label, then the button. */
const overflowButtonBubble = (button: FlexButton): FlexBubble | null =>
  bubble({
    body: box([flexText(button.action.label, "body")]),
    footer: box([button]),
  })

/**
 * Cuts `value` into pieces whose JSON-escaped UTF-8 size is at most `budget`
 * bytes each, by code point (never inside a surrogate pair).
 */
const splitToBytes = (value: string, budget: number): string[] => {
  const pieces: string[] = []
  let current = ""
  let bytes = 0
  for (const char of value) {
    // Minus the two quotes JSON.stringify adds.
    const size = jsonBytes(char) - 2
    if (current && bytes + size > budget) {
      pieces.push(current)
      current = ""
      bytes = 0
    }
    current += char
    bytes += size
  }
  return current ? [...pieces, current] : pieces
}

/**
 * Body text too large for one bubble (only reachable with an extreme text):
 * the texts joined by newlines and cut by size into consecutive bubbles, the
 * first one keeping the hero image.
 */
const oversizedContentBubbles = (
  hero: FlexImage | undefined,
  texts: FlexText[],
): FlexBubble[] => {
  const joined = texts.map((text) => text.text).join("\n")
  const overhead =
    jsonBytes(bubble({ hero, body: box([flexText("x", "body")]) })) - 1
  return splitToBytes(joined, LINE_LIMITS.bubbleBytes - overhead)
    .map((piece, index) =>
      bubble({
        hero: index === 0 ? hero : undefined,
        body: box([flexText(piece, "body")]),
      }),
    )
    .filter((value): value is FlexBubble => value !== null)
}

/**
 * The one bubble builder: hero image, then title / subtitle / text, then the
 * buttons. Returns no bubble for empty content, and one bubble whenever it
 * fits `LINE_LIMITS.bubbleBytes` (always, except with very long `uri` actions
 * or an extreme text).
 *
 * Over budget, nothing is dropped: the content keeps as many leading buttons
 * as fit, and every remaining button follows in its own bubble (its label,
 * then the button). Content that alone exceeds the budget is cut by size
 * into consecutive body bubbles (see `oversizedContentBubbles`).
 */
export function flexBubbles(content: BubbleContent): FlexBubble[] {
  const buttons = content.buttons
    .slice(0, content.maxButtons)
    .map(({ action, style }) =>
      flexButton(action, style ?? DEFAULT_LINE_BUTTON_STYLE),
    )
  const hero = content.imageUrl ? heroImage(content.imageUrl) : undefined
  const texts = [
    flexText(content.title, "title"),
    flexText(content.subtitle, "subtitle"),
    flexText(content.text, "body"),
  ].filter((text): text is FlexText => text !== null)
  const body = box(texts)

  const whole = bubble({ hero, body, footer: box(buttons) })
  if (!whole || fitsBubble(whole)) {
    return whole ? [whole] : []
  }

  const contentOnly = bubble({ hero, body })
  let leading: FlexBubble[] = []
  let kept = 0
  if (contentOnly && fitsBubble(contentOnly)) {
    leading = [contentOnly]
    for (let count = 1; count <= buttons.length; count++) {
      const candidate = bubble({
        hero,
        body,
        footer: box(buttons.slice(0, count)),
      })
      if (!(candidate && fitsBubble(candidate))) {
        break
      }
      leading = [candidate]
      kept = count
    }
  } else if (contentOnly) {
    leading = oversizedContentBubbles(hero, texts)
  }

  const overflow = buttons
    .slice(kept)
    .map(overflowButtonBubble)
    .filter((value): value is FlexBubble => value !== null)
  return [...leading, ...overflow]
}

const flexMessage = (
  altText: string,
  contents: FlexBubble | FlexCarousel,
): FlexMessage => ({
  type: "flex",
  altText: truncate(altText.trim() || FALLBACK_ALT_TEXT, LINE_LIMITS.altText),
  contents,
})

const carousel = (contents: NonEmptyArray<FlexBubble>): FlexCarousel => ({
  type: "carousel",
  contents,
})

/**
 * Groups bubbles, in order, into carousels of at most
 * `LINE_LIMITS.carouselBubbles` bubbles and `LINE_LIMITS.carouselBytes` bytes.
 * A bubble already fits the bubble budget, which is below the carousel one.
 */
const CAROUSEL_WRAPPER_BYTES = jsonBytes({ type: "carousel", contents: [] })

const packCarousels = (bubbles: FlexBubble[]): FlexCarousel[] => {
  const groups: FlexBubble[][] = []
  let current: FlexBubble[] = []
  // Serialized size of `{ type: "carousel", contents: current }`, kept as a
  // running total: each bubble adds its own bytes plus a separating comma.
  let currentBytes = CAROUSEL_WRAPPER_BYTES
  for (const item of bubbles) {
    const itemBytes = jsonBytes(item)
    const nextBytes = currentBytes + itemBytes + (current.length > 0 ? 1 : 0)
    const full =
      current.length + 1 > LINE_LIMITS.carouselBubbles ||
      nextBytes > LINE_LIMITS.carouselBytes
    if (current.length > 0 && full) {
      groups.push(current)
      current = [item]
      currentBytes = CAROUSEL_WRAPPER_BYTES + itemBytes
    } else {
      current.push(item)
      currentBytes = nextBytes
    }
  }
  groups.push(current)
  return groups.flatMap((group) => {
    const contents = nonEmpty(group)
    return contents ? [carousel(contents)] : []
  })
}

/**
 * `bubbles` as flex messages: one bubble message, or for several bubbles as
 * many carousel messages as the count and size budgets need, in order.
 * `altText` (what notifications and the chat list show) falls back to "-"
 * when blank and is cut to `LINE_LIMITS.altText`.
 */
export function flexMessages(
  bubbles: FlexBubble[],
  altText: string,
): FlexMessage[] {
  const [only, ...more] = bubbles
  if (!only) {
    return []
  }
  if (more.length === 0) {
    return [flexMessage(altText, only)]
  }
  return packCarousels(bubbles).map((contents) =>
    flexMessage(altText, contents),
  )
}

/** Button labels joined with " / ", used as alt or body text for a buttons-only message. */
export const buttonLabels = (
  buttons: LineButton[],
  maxButtons: number,
): string =>
  buttons
    .slice(0, maxButtons)
    .map(({ action }) => action.label)
    .join(" / ")

/**
 * Buttons after a message that cannot carry them (media, file link): a
 * bubble whose body is the button labels, then the buttons. They are the
 * step's own, so the step limit applies.
 */
export const buttonsFollowUp = (buttons: LineButton[]): FlexMessage[] => {
  const maxButtons = LINE_LIMITS.stepButtons
  const labels = buttonLabels(buttons, maxButtons)
  return flexMessages(
    flexBubbles({ text: labels, buttons, maxButtons }),
    labels,
  )
}
