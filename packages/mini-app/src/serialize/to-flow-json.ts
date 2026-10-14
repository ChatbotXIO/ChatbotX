// biome-ignore-all lint/suspicious/noThenProperty: `then` is the Flow JSON If branch key
import { isTextInputDateType, TEXT_INPUT_DATE_FORMATS } from "../components"
import { isNestedExpression } from "../expression"
import {
  isTerminalScreen,
  MINI_APP_ACTION_KEY,
  MINI_APP_LIST_ITEMS_KEY,
  readMiniAppAction,
  slotEntries,
} from "../tree"
import {
  type FlowJson,
  type FlowJsonComponent,
  type FlowJsonScreen,
  MINI_APP_FLOW_JSON_VERSION,
  type MiniAppDefinition,
  type MiniAppNode,
  type MiniAppScreen,
} from "../types"
import { cleanObject } from "./clean-object"
import { buildCompletePayload } from "./navigation"

interface SerializeContext {
  definition: MiniAppDefinition
  screen: MiniAppScreen
  screenIds: Map<string, string>
}

const serializeAction = (
  value: unknown,
  context: SerializeContext,
): Record<string, unknown> | undefined => {
  const action = readMiniAppAction(value)
  if (!action) {
    return
  }
  switch (action.name) {
    case "navigate": {
      const target = context.screenIds.get(action.next)
      return target
        ? {
            name: "navigate",
            next: { type: "screen", name: target },
            payload: {},
          }
        : undefined
    }
    case "complete":
      return {
        name: "complete",
        payload: buildCompletePayload(context.definition, context.screen.key),
      }
    default:
      return { name: "open_url", url: action.url }
  }
}

const REFERENCE_SPLIT = /(\$\{[^}]*\})/
const WHOLE_REFERENCE = /^\$\{[^}]*\}$/
const BACKSLASH = /\\/g
const SINGLE_QUOTE = /'/g
const BACKTICK = /`/g
/** Expression-valued properties Meta writes without backticks. */
const RAW_EXPRESSION_KEYS: ReadonlySet<string> = new Set(["condition", "value"])

const quoteLiteral = (text: string): string =>
  `'${text.replace(BACKSLASH, "\\\\").replace(SINGLE_QUOTE, "\\'").replace(BACKTICK, "'")}'`

/**
 * Flow JSON only accepts a property that is a whole `${...}` reference or a
 * backtick nested expression (6.0+). Text mixing words and references —
 * "Hello ${form.name}" — becomes "`'Hello ' ${form.name}`".
 */
export const toNestedExpression = (text: string): string => {
  const trimmed = text.trim()
  if (
    !text.includes("${") ||
    WHOLE_REFERENCE.test(trimmed) ||
    isNestedExpression(trimmed)
  ) {
    return text
  }
  const parts = text
    .split(REFERENCE_SPLIT)
    .filter((part) => part !== "")
    .map((part) => (WHOLE_REFERENCE.test(part) ? part : quoteLiteral(part)))
  return `\`${parts.join(" ")}\``
}

const toNestedExpressions = (
  value: Record<string, unknown>,
): Record<string, unknown> => {
  const convert = (entry: unknown, key?: string): unknown => {
    if (typeof entry === "string") {
      return key && RAW_EXPRESSION_KEYS.has(key)
        ? entry
        : toNestedExpression(entry)
    }
    if (Array.isArray(entry)) {
      return entry.map((item) => convert(item))
    }
    if (entry && typeof entry === "object") {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>).map(
          ([childKey, child]) => [childKey, convert(child, childKey)],
        ),
      )
    }
    return entry
  }
  return convert(value) as Record<string, unknown>
}

const serializeNode = (
  node: MiniAppNode,
  context: SerializeContext,
): FlowJsonComponent => {
  const {
    [MINI_APP_ACTION_KEY]: action,
    [MINI_APP_LIST_ITEMS_KEY]: listItems,
    ...rest
  } = node.props
  const output: FlowJsonComponent = {
    type: node.type,
    ...toNestedExpressions(cleanObject(rest)),
  }
  const inputType = rest["input-type"]
  if (node.type === "TextInput" && isTextInputDateType(inputType)) {
    // Meta has no date keyboard: a text input checked by a pattern instead.
    const format = TEXT_INPUT_DATE_FORMATS[inputType]
    output["input-type"] = "text"
    output.pattern ??= format.pattern
    output["helper-text"] ??= format.helperText
  }

  if (Array.isArray(listItems)) {
    output[MINI_APP_LIST_ITEMS_KEY] = (
      listItems as Record<string, unknown>[]
    ).map((item) => {
      const { [MINI_APP_ACTION_KEY]: itemAction, ...itemRest } = item
      const serializedAction = serializeAction(itemAction, context)
      return {
        ...toNestedExpressions(cleanObject(itemRest)),
        ...(serializedAction
          ? { [MINI_APP_ACTION_KEY]: serializedAction }
          : {}),
      }
    })
  }
  const serializedAction = serializeAction(action, context)
  if (serializedAction) {
    output[MINI_APP_ACTION_KEY] = serializedAction
  }

  const serializeList = (nodes: MiniAppNode[] | undefined) =>
    (nodes ?? []).map((child) => serializeNode(child, context))

  switch (node.type) {
    case "Form":
      output.children = serializeList(node.slots?.children)
      break
    case "If": {
      output.then = serializeList(node.slots?.then)
      const elseBranch = serializeList(node.slots?.else)
      if (elseBranch.length > 0) {
        output.else = elseBranch
      }
      break
    }
    case "Switch":
      output.cases = Object.fromEntries(
        slotEntries(node).map(([key, nodes]) => [key, serializeList(nodes)]),
      )
      break
    default:
      break
  }
  return output
}

/** Converts the editor definition into Meta's Flow JSON (version 7.3). */
export const toFlowJson = (definition: MiniAppDefinition): FlowJson => {
  const screenIds = new Map(
    definition.screens.map((screen) => [screen.key, screen.id]),
  )
  return {
    version: MINI_APP_FLOW_JSON_VERSION,
    screens: definition.screens.map((screen): FlowJsonScreen => {
      const context: SerializeContext = { definition, screen, screenIds }
      return {
        id: screen.id,
        ...(screen.title.trim() ? { title: screen.title.trim() } : {}),
        ...(isTerminalScreen(screen) ? { terminal: true, success: true } : {}),
        layout: {
          type: "SingleColumnLayout",
          children: screen.children.map((node) => serializeNode(node, context)),
        },
      }
    }),
  }
}
