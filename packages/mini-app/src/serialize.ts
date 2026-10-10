// biome-ignore-all lint/suspicious/noThenProperty: `then` is the Flow JSON If branch key
import { MINI_APP_COMPONENTS } from "./components"
import { createMiniAppId, walkNodes } from "./tree"
import {
  type FlowJson,
  type FlowJsonComponent,
  type FlowJsonScreen,
  MINI_APP_FLOW_JSON_VERSION,
  type MiniAppAction,
  type MiniAppDefinition,
  type MiniAppNode,
  type MiniAppScreen,
  miniAppActionSchema,
  miniAppComponentTypes,
} from "./types"

const ACTION_KEY = "on-click-action"
const LIST_ITEMS_KEY = "list-items"

/** Input names per screen key, in document order. */
export const collectInputNames = (screen: MiniAppScreen): string[] => {
  const names: string[] = []
  walkNodes(screen.children, ({ node }) => {
    const name = node.props.name
    if (
      MINI_APP_COMPONENTS[node.type].isInput &&
      typeof name === "string" &&
      name
    ) {
      names.push(name)
    }
  })
  return names
}

const readAction = (value: unknown): MiniAppAction | undefined => {
  const parsed = miniAppActionSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

/** Every navigate target per screen key. */
export const buildNavigationGraph = (
  definition: MiniAppDefinition,
): Map<string, Set<string>> => {
  const graph = new Map<string, Set<string>>()
  for (const screen of definition.screens) {
    const targets = new Set<string>()
    walkNodes(screen.children, ({ node }) => {
      const action = readAction(node.props[ACTION_KEY])
      if (action?.name === "navigate") {
        targets.add(action.next)
      }
      const items = node.props[LIST_ITEMS_KEY]
      if (Array.isArray(items)) {
        for (const item of items as Record<string, unknown>[]) {
          const itemAction = readAction(item[ACTION_KEY])
          if (itemAction?.name === "navigate") {
            targets.add(itemAction.next)
          }
        }
      }
    })
    graph.set(screen.key, targets)
  }
  return graph
}

/** Screen keys from which `screenKey` can be reached (including itself). */
export const collectPathScreens = (
  definition: MiniAppDefinition,
  screenKey: string,
): Set<string> => {
  const graph = buildNavigationGraph(definition)
  const reached = new Set<string>([screenKey])
  let changed = true
  while (changed) {
    changed = false
    for (const [source, targets] of graph) {
      if (reached.has(source)) {
        continue
      }
      if ([...targets].some((target) => reached.has(target))) {
        reached.add(source)
        changed = true
      }
    }
  }
  return reached
}

/**
 * The `complete` payload for a screen: every input on the screens that can
 * lead to it, keyed by input name (names are unique app-wide).
 */
export const buildCompletePayload = (
  definition: MiniAppDefinition,
  screenKey: string,
): Record<string, string> => {
  const onPath = collectPathScreens(definition, screenKey)
  const payload: Record<string, string> = {}
  for (const screen of definition.screens) {
    if (!onPath.has(screen.key)) {
      continue
    }
    for (const name of collectInputNames(screen)) {
      payload[name] =
        screen.key === screenKey
          ? `\${form.${name}}`
          : `\${screen.${screen.id}.form.${name}}`
    }
  }
  return payload
}

const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0)

/** Drops empty strings, empty arrays and undefined values (Meta rejects blank strings). */
export const cleanObject = (
  value: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (isEmptyValue(entry)) {
      continue
    }
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const nested = cleanObject(entry as Record<string, unknown>)
      if (Object.keys(nested).length > 0) {
        result[key] = nested
      }
      continue
    }
    if (Array.isArray(entry)) {
      result[key] = entry.map((item) =>
        item && typeof item === "object"
          ? cleanObject(item as Record<string, unknown>)
          : item,
      )
      continue
    }
    result[key] = entry
  }
  return result
}

interface SerializeContext {
  definition: MiniAppDefinition
  screen: MiniAppScreen
  screenIds: Map<string, string>
}

const serializeAction = (
  value: unknown,
  context: SerializeContext,
): Record<string, unknown> | undefined => {
  const action = readAction(value)
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
    (trimmed.length >= 2 && trimmed.startsWith("`") && trimmed.endsWith("`"))
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
    [ACTION_KEY]: action,
    [LIST_ITEMS_KEY]: listItems,
    ...rest
  } = node.props
  const output: FlowJsonComponent = {
    type: node.type,
    ...toNestedExpressions(cleanObject(rest)),
  }

  if (Array.isArray(listItems)) {
    output[LIST_ITEMS_KEY] = (listItems as Record<string, unknown>[]).map(
      (item) => {
        const { [ACTION_KEY]: itemAction, ...itemRest } = item
        const serializedAction = serializeAction(itemAction, context)
        return {
          ...toNestedExpressions(cleanObject(itemRest)),
          ...(serializedAction ? { [ACTION_KEY]: serializedAction } : {}),
        }
      },
    )
  }
  const serializedAction = serializeAction(action, context)
  if (serializedAction) {
    output[ACTION_KEY] = serializedAction
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
        Object.entries(node.slots ?? {}).map(([key, nodes]) => [
          key,
          serializeList(nodes),
        ]),
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
        ...(screen.terminal ? { terminal: true, success: true } : {}),
        layout: {
          type: "SingleColumnLayout",
          children: screen.children.map((node) => serializeNode(node, context)),
        },
      }
    }),
  }
}

export type MiniAppImportErrorCode =
  | "unsupported_endpoint"
  | "unsupported_action"
  | "unsupported_property"
  | "unknown_component"
  | "unknown_screen"
  | "invalid_component"

export class MiniAppImportError extends Error {
  readonly code: MiniAppImportErrorCode
  readonly path: string

  constructor(code: MiniAppImportErrorCode, path: string) {
    super(`${code} at ${path}`)
    this.name = "MiniAppImportError"
    this.code = code
    this.path = path
  }
}

const UNSUPPORTED_COMPONENT_KEYS = ["on-select-action", "on-unselect-action"]

interface ImportContext {
  screenKeys: Map<string, string>
}

const importAction = (
  value: unknown,
  path: string,
  context: ImportContext,
): MiniAppAction => {
  const action = (value ?? {}) as Record<string, unknown>
  switch (action.name) {
    case "navigate": {
      const next = (action.next ?? {}) as Record<string, unknown>
      const key = context.screenKeys.get(String(next.name ?? ""))
      if (!key) {
        throw new MiniAppImportError("unknown_screen", `${path}.next.name`)
      }
      return { name: "navigate", next: key }
    }
    case "complete":
      return { name: "complete" }
    case "open_url":
      if (typeof action.url !== "string") {
        throw new MiniAppImportError("unsupported_action", path)
      }
      return { name: "open_url", url: action.url }
    default:
      throw new MiniAppImportError("unsupported_action", path)
  }
}

const importNode = (
  component: Record<string, unknown>,
  path: string,
  context: ImportContext,
): MiniAppNode => {
  const typeParse = miniAppComponentTypes.safeParse(component.type)
  if (!typeParse.success) {
    throw new MiniAppImportError("unknown_component", `${path}.type`)
  }
  const type = typeParse.data
  for (const key of UNSUPPORTED_COMPONENT_KEYS) {
    if (key in component) {
      throw new MiniAppImportError("unsupported_property", `${path}.${key}`)
    }
  }
  const {
    type: _type,
    children,
    then,
    else: elseBranch,
    cases,
    [ACTION_KEY]: action,
    [LIST_ITEMS_KEY]: listItems,
    ...rest
  } = component
  const props: Record<string, unknown> = { ...rest }
  if (action !== undefined) {
    props[ACTION_KEY] = importAction(action, `${path}.${ACTION_KEY}`, context)
  }
  if (Array.isArray(listItems)) {
    props[LIST_ITEMS_KEY] = (listItems as Record<string, unknown>[]).map(
      (item, index) => {
        const { [ACTION_KEY]: itemAction, ...itemRest } = item
        return itemAction === undefined
          ? itemRest
          : {
              ...itemRest,
              [ACTION_KEY]: importAction(
                itemAction,
                `${path}.${LIST_ITEMS_KEY}[${index}].${ACTION_KEY}`,
                context,
              ),
            }
      },
    )
  }

  const importList = (value: unknown, slotPath: string): MiniAppNode[] => {
    if (value === undefined) {
      return []
    }
    if (!Array.isArray(value)) {
      throw new MiniAppImportError("invalid_component", slotPath)
    }
    return value.map((child, index) =>
      importNode(
        child as Record<string, unknown>,
        `${slotPath}[${index}]`,
        context,
      ),
    )
  }

  const node: MiniAppNode = { id: createMiniAppId(), type, props }
  switch (type) {
    case "Form":
      node.slots = { children: importList(children, `${path}.children`) }
      break
    case "If":
      node.slots = {
        then: importList(then, `${path}.then`),
        else: importList(elseBranch, `${path}.else`),
      }
      break
    case "Switch": {
      if (!cases || typeof cases !== "object" || Array.isArray(cases)) {
        throw new MiniAppImportError("invalid_component", `${path}.cases`)
      }
      node.slots = Object.fromEntries(
        Object.entries(cases as Record<string, unknown>).map(([key, nodes]) => [
          key,
          importList(nodes, `${path}.cases.${key}`),
        ]),
      )
      break
    }
    default:
      break
  }
  return node
}

/**
 * Converts Meta Flow JSON into an editor definition. Only endpoint-less flows
 * are accepted; generated payloads are dropped because `toFlowJson`
 * regenerates them. Throws `MiniAppImportError` on anything unsupported.
 */
export const fromFlowJson = (flowJson: FlowJson): MiniAppDefinition => {
  if ("data_api_version" in flowJson || "data_channel_uri" in flowJson) {
    throw new MiniAppImportError("unsupported_endpoint", "data_api_version")
  }
  const screenKeys = new Map(
    flowJson.screens.map((screen) => [screen.id, createMiniAppId("s")]),
  )
  const context: ImportContext = { screenKeys }
  return {
    screens: flowJson.screens.map((screen, screenIndex) => ({
      key: screenKeys.get(screen.id) as string,
      id: screen.id,
      title: typeof screen.title === "string" ? screen.title : "",
      terminal: screen.terminal === true,
      children: (screen.layout?.children ?? []).map((component, index) =>
        importNode(
          component,
          `screens[${screenIndex}].layout.children[${index}]`,
          context,
        ),
      ),
    })),
  }
}
