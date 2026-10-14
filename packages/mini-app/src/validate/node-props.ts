import { MINI_APP_COMPONENTS, needsName } from "../components"
import {
  collapseContactVariables,
  mapNodeDisplayText,
  nodeHasContactVariables,
} from "../display-text"
import { extractReferences, isValidExpression } from "../expression"
import { cleanObject } from "../serialize"
import {
  MINI_APP_ACTION_KEY,
  MINI_APP_LIST_ITEMS_KEY,
  readMiniAppAction,
} from "../tree"
import type { MiniAppAction, MiniAppNode } from "../types"
import { checkComponentRules } from "./component-rules"
import {
  issueFromZod,
  type NodeReporter,
  nodeReporter,
  type ScreenContext,
} from "./issues"

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Props whose value must not be greater than its pair's. */
const MIN_MAX_PAIRS: readonly [min: string, max: string][] = [
  ["min-chars", "max-chars"],
  ["min-selected-items", "max-selected-items"],
  ["min-uploaded-photos", "max-uploaded-photos"],
  ["min-uploaded-documents", "max-uploaded-documents"],
  ["min-days", "max-days"],
  ["min-date", "max-date"],
]

/** The prop holding the expression of an If or Switch. */
const EXPRESSION_PROP: Partial<Record<MiniAppNode["type"], string>> = {
  If: "condition",
  Switch: "value",
}

/** Props that never hold references: actions and images. */
const SKIPPED_REFERENCE_KEYS = new Set([MINI_APP_ACTION_KEY, "src", "image"])

/** Checks the props against the component's schema, with each `{{variable}}` counted as one character. */
const checkSchema = (node: MiniAppNode, report: NodeReporter) => {
  const { [MINI_APP_ACTION_KEY]: _action, ...measuredProps } =
    mapNodeDisplayText(node, collapseContactVariables)
  const parsed = MINI_APP_COMPONENTS[node.type].propsSchema.safeParse(
    cleanObject(measuredProps),
  )
  for (const issue of parsed.error?.issues ?? []) {
    report({
      property: issue.path.map(String).join("."),
      ...issueFromZod(issue),
    })
  }
}

const checkName = (node: MiniAppNode, report: NodeReporter) => {
  const name = node.props.name
  if (
    needsName(node.type) &&
    (typeof name !== "string" || !NAME_PATTERN.test(name))
  ) {
    report({ property: "name", code: "name_invalid" })
  }
}

const checkMinMax = (node: MiniAppNode, report: NodeReporter) => {
  for (const [minKey, maxKey] of MIN_MAX_PAIRS) {
    const min = node.props[minKey]
    const max = node.props[maxKey]
    // Numbers compare as numbers, ISO dates as strings.
    const isGreater =
      (typeof min === "number" && typeof max === "number" && min > max) ||
      (typeof min === "string" && typeof max === "string" && min > max)
    if (isGreater) {
      report({ property: minKey, code: "min_greater_than_max" })
    }
  }
}

const checkAction = (
  value: unknown,
  rules: { property: string; allowed?: readonly string[]; required: boolean },
  report: NodeReporter,
  context: ScreenContext,
): MiniAppAction | undefined => {
  const { property } = rules
  if (value === undefined || value === null) {
    if (rules.required) {
      report({ property, code: "action_required" })
    }
    return
  }
  const action = readMiniAppAction(value)
  if (!(action && rules.allowed?.includes(action.name))) {
    report({ property, code: "action_not_allowed" })
    return
  }
  if (action.name === "navigate") {
    if (!context.screenKeys.has(action.next)) {
      report({ property, code: "navigate_target_missing" })
    } else if (action.next === context.screen.key) {
      report({ property, code: "navigate_self" })
    }
  }
  return action
}

/** Each NavigationList item must navigate to another screen. */
const checkNavigationItemActions = (
  node: MiniAppNode,
  report: NodeReporter,
  context: ScreenContext,
) => {
  const items = node.props[MINI_APP_LIST_ITEMS_KEY]
  if (node.type !== "NavigationList" || !Array.isArray(items)) {
    return
  }
  items.forEach((item, index) => {
    checkAction(
      (item as Record<string, unknown>)?.[MINI_APP_ACTION_KEY],
      {
        property: `${MINI_APP_LIST_ITEMS_KEY}.${index}.${MINI_APP_ACTION_KEY}`,
        allowed: ["navigate"],
        required: true,
      },
      report,
      context,
    )
  })
}

const checkExpression = (node: MiniAppNode, report: NodeReporter) => {
  const property = EXPRESSION_PROP[node.type]
  const expression = property && node.props[property]
  if (
    typeof expression === "string" &&
    expression.trim() &&
    !isValidExpression(expression)
  ) {
    report({ property, code: "expression_invalid" })
  }
}

/** Calls `visit` with every string inside `value` and its dotted path. */
const forEachString = (
  value: unknown,
  path: string,
  visit: (text: string, path: string) => void,
) => {
  if (typeof value === "string") {
    visit(value, path)
  } else if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      forEachString(item, `${path}.${index}`, visit)
    }
  } else if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (!SKIPPED_REFERENCE_KEYS.has(key)) {
        forEachString(entry, path ? `${path}.${key}` : key, visit)
      }
    }
  }
}

/** Every `${...}` must point at an input of this screen or of a named screen. */
const checkReferences = (
  node: MiniAppNode,
  report: NodeReporter,
  context: ScreenContext,
) => {
  forEachString(node.props, "", (text, property) => {
    for (const { raw, reference } of extractReferences(text)) {
      const base = { property, params: { reference: raw } }
      if (!reference) {
        report({ ...base, code: "reference_invalid" })
      } else if (reference.source === "data") {
        report({ ...base, code: "data_reference_unsupported" })
      } else {
        const names = reference.screenId
          ? context.namesByScreenId.get(reference.screenId)
          : context.localNames
        if (!names?.has(reference.name)) {
          report({ ...base, code: "reference_unknown" })
        }
      }
    }
  })
}

/** Every rule about one node's own props. */
export const checkNodeProps = (node: MiniAppNode, context: ScreenContext) => {
  const report = nodeReporter(context, node)
  const definition = MINI_APP_COMPONENTS[node.type]
  checkSchema(node, report)
  checkName(node, report)
  checkMinMax(node, report)
  checkAction(
    node.props[MINI_APP_ACTION_KEY],
    {
      property: MINI_APP_ACTION_KEY,
      allowed: definition.actions,
      required: definition.actionRequired === true,
    },
    report,
    context,
  )
  checkComponentRules(node, report)
  if (nodeHasContactVariables(node)) {
    report({ code: "contact_variable_whatsapp", severity: "warning" })
  }
  checkNavigationItemActions(node, report, context)
  checkExpression(node, report)
  checkReferences(node, report, context)
}
