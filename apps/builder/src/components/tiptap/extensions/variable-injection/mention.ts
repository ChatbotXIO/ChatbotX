import type {
  MentionNodeAttrs,
  MentionOptions,
} from "@tiptap/extension-mention"
import type { PromptVariableOption } from "./definition"

export const VARIABLE_MENTION_CHAR = "{{"

type MentionRenderHTML = MentionOptions["renderHTML"]
type MentionRenderText = MentionOptions["renderText"]

const LINE_BREAK_REGEX = /\r\n?|\n/
const VARIABLE_TOKEN_REGEX = /\{\{([^{}\n]+)\}\}/g
const COUPON_VARIABLE_TOKEN_REGEX = /\{\{coupon:([^{}\n]+)\}\}/g
const COUPON_VARIABLE_ID_PREFIX = "coupon:"
// Boundary-safe: lookarounds skip a token wrapped in extra braces
// (`{{{{bot_field:1}}}}`) — malformed text stays verbatim in the preview
// rather than being half-relabeled into something even more confusing.
const BOT_FIELD_VARIABLE_TOKEN_REGEX = /(?<!\{)\{\{bot_field:(\d+)\}\}(?!\})/g
const BOT_FIELD_VARIABLE_ID_PREFIX = "bot_field:"
const TRAILING_DOUBLE_BRACE_REGEX = /\}\}$/

const isCouponMentionId = (id: unknown) =>
  typeof id === "string" && id.startsWith(COUPON_VARIABLE_ID_PREFIX)

const isBotFieldMentionId = (id: unknown) =>
  typeof id === "string" && id.startsWith(BOT_FIELD_VARIABLE_ID_PREFIX)

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const escapeHtmlAttribute = (value: string) =>
  escapeHtml(value).replace(/"/g, "&quot;")

const normalizeMentionId = (id: unknown) =>
  String(id ?? "").replace(TRAILING_DOUBLE_BRACE_REGEX, "")

const variableText = (value: unknown) =>
  `${VARIABLE_MENTION_CHAR}${normalizeMentionId(value)}}}`

export const toVariableMentionAttrs = (
  option: PromptVariableOption,
): MentionNodeAttrs => ({
  id: String(option.value),
  label: option.label,
  mentionSuggestionChar: VARIABLE_MENTION_CHAR,
})

export const renderVariableMentionText: MentionRenderText = ({ node }) =>
  variableText(node.attrs.id)

// Coupon and bot-field mentions carry an OPAQUE id (`coupon:<topicId>`,
// `bot_field:<id>`) — the chip must display the human label instead; a
// custom-field mention's id IS its name, so it displays as-is. Serialization
// (`renderVariableMentionText` above) always keeps the id-based token.
export const renderVariableMentionHTML: MentionRenderHTML = ({
  options,
  node,
}) =>
  [
    "span",
    options.HTMLAttributes,
    variableText(
      isCouponMentionId(node.attrs.id) || isBotFieldMentionId(node.attrs.id)
        ? (node.attrs.label ?? node.attrs.id)
        : node.attrs.id,
    ),
  ] as const

const mentionHtml = (attrs: MentionNodeAttrs) =>
  `<span data-type="mention" data-id="${escapeHtmlAttribute(attrs.id ?? "")}" data-label="${escapeHtmlAttribute(attrs.label ?? "")}" data-mention-suggestion-char="${VARIABLE_MENTION_CHAR}"></span>`

const lineToHtml = (
  line: string,
  optionsByValue: Map<string, PromptVariableOption>,
) => {
  let cursor = 0
  let html = ""

  for (const match of line.matchAll(VARIABLE_TOKEN_REGEX)) {
    const rawToken = match[0]
    const value = match[1]?.trim() ?? ""
    const start = match.index ?? 0
    const option = optionsByValue.get(value)

    html += escapeHtml(line.slice(cursor, start))
    html += option
      ? mentionHtml(toVariableMentionAttrs(option))
      : escapeHtml(rawToken)
    cursor = start + rawToken.length
  }

  html += escapeHtml(line.slice(cursor))
  return html
}

// A blank line must become `<p></p>`, not `<p><br></p>`: ProseMirror renders
// an empty paragraph's cursor line on its own, but a real <br> node adds its
// own "\n" via HardBreak's renderText on top of the blockSeparator that
// editor.getText() already inserts between blocks — doubling every blank
// line on each save/reload round trip.
export const plainTextToParagraphHtmlWithVariableMentions = (
  value: string,
  variableOptions: PromptVariableOption[],
) => {
  const optionsByValue = new Map(
    variableOptions.map((option) => [String(option.value), option]),
  )

  return value
    .replace(/\xA0/g, " ")
    .split(LINE_BREAK_REGEX)
    .map((line) => `<p>${lineToHtml(line, optionsByValue)}</p>`)
    .join("")
}

export const replaceCouponVariableTokensWithLabels = (
  value: string,
  labelById: Map<string, string>,
) =>
  value.replace(COUPON_VARIABLE_TOKEN_REGEX, (match, topicId: string) => {
    const label = labelById.get(topicId.trim())
    return label ? `{{${label}}}` : match
  })

/**
 * Read-only preview substitution for the node viewers on the canvas —
 * mirrors `replaceCouponVariableTokensWithLabels`. An unknown id (deleted
 * field, labels not loaded yet) keeps the raw token.
 */
export const replaceBotFieldVariableTokensWithLabels = (
  value: string,
  labelById: Map<string, string>,
) =>
  value.replace(BOT_FIELD_VARIABLE_TOKEN_REGEX, (match, botFieldId: string) => {
    const label = labelById.get(botFieldId)
    return label ? `{{${label}}}` : match
  })
