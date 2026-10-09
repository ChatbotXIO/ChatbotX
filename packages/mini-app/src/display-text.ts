import { flattenNodes } from "./tree"
import type {
  MiniAppComponentType,
  MiniAppDefinition,
  MiniAppNode,
} from "./types"

/**
 * Every visitor-facing text of a Mini App — where contact custom fields
 * (`{{first_name}}`) may be inserted. Keys, ids, conditions, URLs and alt
 * text are deliberately not listed.
 */
export const DISPLAY_TEXT_PROPS: Readonly<
  Record<MiniAppComponentType, readonly string[]>
> = {
  TextHeading: ["text"],
  TextSubheading: ["text"],
  TextBody: ["text"],
  TextCaption: ["text"],
  RichText: ["text"],
  TextInput: ["label", "helper-text", "error-message"],
  TextArea: ["label", "helper-text", "error-message"],
  Dropdown: ["label", "error-message"],
  RadioButtonsGroup: ["label", "description", "error-message"],
  CheckboxGroup: ["label", "description", "error-message"],
  ChipsSelector: ["label", "description", "error-message"],
  DatePicker: ["label", "helper-text", "error-message"],
  CalendarPicker: [
    "label",
    "title",
    "description",
    "helper-text",
    "error-message",
  ],
  OptIn: ["label"],
  PhotoPicker: ["label", "description", "error-message"],
  DocumentPicker: ["label", "description", "error-message"],
  Image: [],
  ImageCarousel: [],
  EmbeddedLink: ["text"],
  NavigationList: [],
  Footer: ["label", "left-caption", "center-caption", "right-caption"],
  Form: [],
  If: [],
  Switch: [],
}

/** Display texts of each selection option (`data-source` item). */
export const OPTION_DISPLAY_TEXT_PROPS = [
  "title",
  "description",
  "metadata",
] as const

/** Matches one `{{variable}}` token. */
export const CONTACT_VARIABLE_PATTERN = /\{\{[^{}\n]+\}\}/g
const CONTACT_VARIABLE_TEST = /\{\{[^{}\n]+\}\}/

export const hasContactVariable = (value: unknown): boolean =>
  typeof value === "string" && CONTACT_VARIABLE_TEST.test(value)

/** Length of a display text where each `{{variable}}` counts as one character. */
export const displayTextLength = (text: string): number =>
  text.replace(CONTACT_VARIABLE_PATTERN, "x").length

/** Where a display text is shown, which decides how a value put into it must be escaped. */
export interface DisplayTextContext {
  /** Rendered as markdown (RichText, or TextBody with `markdown: true`). */
  markdown: boolean
}

interface DisplayTextSlot {
  context: DisplayTextContext
  /** The object (or array) holding the text, so a mapper can write it back. */
  holder: Record<string, unknown>
  key: string
}

const PLAIN_CONTEXT: DisplayTextContext = { markdown: false }
const NAVIGATION_CONTENT_TEXT_PROPS = ["title", "description", "metadata"]

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

const isMarkdownText = (node: MiniAppNode, key: string): boolean =>
  key === "text" &&
  (node.type === "RichText" ||
    (node.type === "TextBody" && node.props.markdown === true))

function* objectSlots(
  value: unknown,
  keys: readonly string[],
): Generator<DisplayTextSlot> {
  const holder = asRecord(value)
  if (!holder) {
    return
  }
  for (const key of keys) {
    if (typeof holder[key] === "string") {
      yield { holder, key, context: PLAIN_CONTEXT }
    }
  }
}

function* navigationItemSlots(item: unknown): Generator<DisplayTextSlot> {
  const source = asRecord(item)
  if (!source) {
    return
  }
  yield* objectSlots(source["main-content"], NAVIGATION_CONTENT_TEXT_PROPS)
  yield* objectSlots(source.end, NAVIGATION_CONTENT_TEXT_PROPS)
  yield* objectSlots(source, ["badge"])
  if (Array.isArray(source.tags)) {
    const tags = source.tags as unknown as Record<string, unknown>
    yield* objectSlots(
      tags,
      source.tags.map((_, index) => String(index)),
    )
  }
}

/**
 * The one list of where a node's display texts live (props, options and
 * navigation items) — reading, detecting and replacing all walk it.
 */
function* nodeDisplayTextSlots(
  node: MiniAppNode,
  props: Record<string, unknown>,
): Generator<DisplayTextSlot> {
  for (const key of DISPLAY_TEXT_PROPS[node.type]) {
    if (typeof props[key] === "string") {
      yield {
        holder: props,
        key,
        context: { markdown: isMarkdownText(node, key) },
      }
    }
  }
  if (Array.isArray(props["data-source"])) {
    for (const option of props["data-source"]) {
      yield* objectSlots(option, OPTION_DISPLAY_TEXT_PROPS)
    }
  }
  if (node.type === "NavigationList" && Array.isArray(props["list-items"])) {
    for (const item of props["list-items"]) {
      yield* navigationItemSlots(item)
    }
  }
}

export interface DisplayText {
  context: DisplayTextContext
  text: string
}

/** Every display text of one node, read in place (nothing is copied). */
export function* nodeDisplayTexts(node: MiniAppNode): Generator<DisplayText> {
  for (const slot of nodeDisplayTextSlots(node, node.props)) {
    yield { text: slot.holder[slot.key] as string, context: slot.context }
  }
}

/** Every screen title and display text of the definition, read in place. */
export function* displayTexts(
  definition: MiniAppDefinition,
): Generator<DisplayText> {
  for (const screen of definition.screens) {
    yield { text: screen.title, context: PLAIN_CONTEXT }
    for (const node of flattenNodes(screen.children)) {
      yield* nodeDisplayTexts(node)
    }
  }
}

type TextMapper = (text: string, context: DisplayTextContext) => string

/** The node's props with `fn` applied to every display text (options and list items included). */
export const mapNodeDisplayText = (
  node: MiniAppNode,
  fn: TextMapper,
): Record<string, unknown> => {
  const props = structuredClone(node.props)
  for (const slot of nodeDisplayTextSlots(node, props)) {
    slot.holder[slot.key] = fn(slot.holder[slot.key] as string, slot.context)
  }
  return props
}

/** A copy of the definition with `fn` applied to every screen title and display text. */
export const mapDisplayText = (
  definition: MiniAppDefinition,
  fn: TextMapper,
): MiniAppDefinition => {
  const next = structuredClone(definition)
  for (const screen of next.screens) {
    screen.title = fn(screen.title, PLAIN_CONTEXT)
    for (const node of flattenNodes(screen.children)) {
      for (const slot of nodeDisplayTextSlots(node, node.props)) {
        slot.holder[slot.key] = fn(
          slot.holder[slot.key] as string,
          slot.context,
        )
      }
    }
  }
  return next
}

/** Whether any display text or screen title holds a `{{variable}}`. */
export const hasContactVariables = (definition: MiniAppDefinition): boolean => {
  for (const { text } of displayTexts(definition)) {
    if (hasContactVariable(text)) {
      return true
    }
  }
  return false
}

/** Whether one node's display texts hold a `{{variable}}`. */
export const nodeHasContactVariables = (node: MiniAppNode): boolean => {
  for (const { text } of nodeDisplayTexts(node)) {
    if (hasContactVariable(text)) {
      return true
    }
  }
  return false
}

/** A backslash before one of these characters shows the character as is in markdown. */
export const MARKDOWN_ESCAPE_PATTERN = /\\([\\*_~[\]()#\-.`])/g
const MARKDOWN_SPECIAL_CHARACTER = /[\\*_~[\]()#\-.`]/g
// A word joiner (invisible) splits `${` and `{{`, so a value can never become
// a `${form.x}` reference or a `{{variable}}` token.
const WORD_JOINER = "⁠"
const REFERENCE_START = /\$\{/g
const VARIABLE_START = /\{\{/g
const QUOTED_STRING_SPECIAL_CHARACTER = /[\\'"]/g

/** Whether the text is a backtick-wrapped Flow JSON expression (`` `'Hi ' ${form.name}` ``). */
const isNestedExpression = (text: string): boolean => {
  const trimmed = text.trim()
  return trimmed.length >= 2 && trimmed.startsWith("`") && trimmed.endsWith("`")
}

/**
 * Escapes a contact's value before it is put into `text`, so it is always
 * shown as the plain value — never read as a `${...}` reference, markdown, or
 * the end of a quoted string inside a nested expression.
 */
export const escapeContactValue = (
  value: string,
  text: string,
  context: DisplayTextContext,
): string => {
  let escaped = value
    .replace(REFERENCE_START, () => `$${WORD_JOINER}{`)
    .replace(VARIABLE_START, () => `{${WORD_JOINER}{`)
  if (context.markdown) {
    escaped = escaped.replace(MARKDOWN_SPECIAL_CHARACTER, "\\$&")
  }
  if (isNestedExpression(text)) {
    escaped = escaped.replace(QUOTED_STRING_SPECIAL_CHARACTER, "\\$&")
  }
  return escaped
}
