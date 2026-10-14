// biome-ignore-all lint/suspicious/noThenProperty: `then` is the Flow JSON If branch key
import {
  createMiniAppId,
  MINI_APP_ACTION_KEY,
  MINI_APP_LIST_ITEMS_KEY,
} from "../tree"
import {
  type FlowJson,
  type MiniAppAction,
  type MiniAppDefinition,
  type MiniAppNode,
  miniAppComponentTypes,
} from "../types"

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
    [MINI_APP_ACTION_KEY]: action,
    [MINI_APP_LIST_ITEMS_KEY]: listItems,
    ...rest
  } = component
  const props: Record<string, unknown> = { ...rest }
  if (action !== undefined) {
    props[MINI_APP_ACTION_KEY] = importAction(
      action,
      `${path}.${MINI_APP_ACTION_KEY}`,
      context,
    )
  }
  if (Array.isArray(listItems)) {
    props[MINI_APP_LIST_ITEMS_KEY] = (
      listItems as Record<string, unknown>[]
    ).map((item, index) => {
      const { [MINI_APP_ACTION_KEY]: itemAction, ...itemRest } = item
      return itemAction === undefined
        ? itemRest
        : {
            ...itemRest,
            [MINI_APP_ACTION_KEY]: importAction(
              itemAction,
              `${path}.${MINI_APP_LIST_ITEMS_KEY}[${index}].${MINI_APP_ACTION_KEY}`,
              context,
            ),
          }
    })
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
      const caseEntries = Object.entries(cases as Record<string, unknown>)
      node.slots = Object.fromEntries(
        caseEntries.map(([key, nodes]) => [
          key,
          importList(nodes, `${path}.cases.${key}`),
        ]),
      )
      node.slotOrder = caseEntries.map(([key]) => key)
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
