import type { z } from "zod"
import {
  canPlaceInSlot,
  MINI_APP_COMPONENTS,
  MINI_APP_MAX_COMPONENTS_PER_SCREEN,
  MINI_APP_MAX_IF_DEPTH,
  NAMED_COMPONENT_TYPES,
} from "./components"
import { extractReferences, isValidExpression } from "./expression"
import { cleanObject, collectInputNames, collectPathScreens } from "./serialize"
import { walkNodes } from "./tree"
import {
  type MiniAppAction,
  type MiniAppDefinition,
  type MiniAppNode,
  type MiniAppScreen,
  miniAppActionSchema,
  miniAppDefinitionSchema,
} from "./types"

export type MiniAppIssueCode =
  | "definition_invalid"
  | "screen_id_invalid"
  | "screen_id_reserved"
  | "screen_id_duplicate"
  | "no_terminal_screen"
  | "terminal_screen_without_complete"
  | "screen_without_exit"
  | "screen_unreachable"
  | "too_many_components"
  | "component_limit"
  | "picker_conflict"
  | "picker_multiple_in_complete"
  | "footer_not_last"
  | "footer_in_nested_branch"
  | "footer_missing_in_branch"
  | "navigation_list_with_footer"
  | "navigation_list_on_terminal"
  | "if_too_deep"
  | "if_then_empty"
  | "switch_no_cases"
  | "child_not_allowed"
  | "name_invalid"
  | "name_duplicate"
  | "property_required"
  | "property_too_long"
  | "property_too_short"
  | "property_invalid"
  | "option_duplicate_id"
  | "min_greater_than_max"
  | "action_required"
  | "action_not_allowed"
  | "navigate_target_missing"
  | "navigate_self"
  | "expression_invalid"
  | "reference_invalid"
  | "reference_unknown"
  | "data_reference_unsupported"
  | "property_unknown"
  | "complete_on_non_terminal"
  | "footer_captions_invalid"
  | "options_with_images_limit"
  | "navigation_badge_multiple"

export interface MiniAppValidationIssue {
  code: MiniAppIssueCode
  nodeId?: string
  params?: Record<string, string | number>
  /** Dotted property path inside the node, when the issue is about one property. */
  property?: string
  screenKey?: string
  severity: "error" | "warning"
}

export interface MiniAppValidationResult {
  issues: MiniAppValidationIssue[]
  valid: boolean
}

const SCREEN_ID_PATTERN = /^[A-Za-z][A-Za-z_]*$/
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const RESERVED_SCREEN_IDS = new Set(["SUCCESS"])
const ACTION_KEY = "on-click-action"

const MIN_MAX_PAIRS: readonly [string, string][] = [
  ["min-chars", "max-chars"],
  ["min-selected-items", "max-selected-items"],
  ["min-uploaded-photos", "max-uploaded-photos"],
  ["min-uploaded-documents", "max-uploaded-documents"],
  ["min-days", "max-days"],
  ["min-date", "max-date"],
]

class IssueCollector {
  readonly issues: MiniAppValidationIssue[] = []

  add(
    issue: Omit<MiniAppValidationIssue, "severity"> & {
      severity?: "error" | "warning"
    },
  ) {
    this.issues.push({ severity: "error", ...issue })
  }
}

const zodIssueToCode = (
  issue: z.core.$ZodIssue,
): Pick<MiniAppValidationIssue, "code" | "params"> => {
  switch (issue.code) {
    case "too_big":
      return {
        code: "property_too_long",
        params: { max: Number(issue.maximum) },
      }
    case "too_small":
      return Number(issue.minimum) <= 1 && issue.origin === "string"
        ? { code: "property_required" }
        : { code: "property_too_short", params: { min: Number(issue.minimum) } }
    case "custom":
      return issue.message === "duplicate_option_id"
        ? { code: "option_duplicate_id" }
        : { code: "property_invalid" }
    case "unrecognized_keys":
      return {
        code: "property_unknown",
        params: { name: issue.keys.join(", ") },
      }
    case "invalid_type":
      return issue.input === undefined
        ? { code: "property_required" }
        : { code: "property_invalid" }
    default:
      return { code: "property_invalid" }
  }
}

const DROPDOWN_MAX_OPTIONS_WITH_IMAGES = 100

const hasText = (value: unknown) =>
  typeof value === "string" && value.trim() !== ""

/** Cross-property rules Meta enforces that a per-property schema cannot express. */
const checkComponentRules = (node: MiniAppNode, context: ScreenContext) => {
  const base = { screenKey: context.screen.key, nodeId: node.id }
  if (node.type === "Footer") {
    const left = hasText(node.props["left-caption"])
    const right = hasText(node.props["right-caption"])
    const center = hasText(node.props["center-caption"])
    // Either a center caption alone, or a left and right caption together.
    if ((center && (left || right)) || left !== right) {
      context.collector.add({
        ...base,
        property: "left-caption",
        code: "footer_captions_invalid",
      })
    }
  }
  const options = node.props["data-source"]
  if (
    node.type === "Dropdown" &&
    Array.isArray(options) &&
    options.length > DROPDOWN_MAX_OPTIONS_WITH_IMAGES &&
    options.some((option) =>
      hasText((option as Record<string, unknown>)?.image),
    )
  ) {
    context.collector.add({
      ...base,
      property: "data-source",
      code: "options_with_images_limit",
      params: { max: DROPDOWN_MAX_OPTIONS_WITH_IMAGES },
    })
  }
  const items = node.props["list-items"]
  if (
    node.type === "NavigationList" &&
    Array.isArray(items) &&
    items.filter((item) => hasText((item as Record<string, unknown>)?.badge))
      .length > 1
  ) {
    context.collector.add({
      ...base,
      property: "list-items",
      code: "navigation_badge_multiple",
    })
  }
}

const readAction = (value: unknown): MiniAppAction | undefined => {
  const parsed = miniAppActionSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

interface ScreenContext {
  collector: IssueCollector
  definition: MiniAppDefinition
  /** Names reachable as `${form.x}` on this screen. */
  localNames: Set<string>
  /** Names per screen id, for `${screen.ID.form.x}`. */
  namesByScreenId: Map<string, Set<string>>
  screen: MiniAppScreen
  screenKeys: Set<string>
}

const checkAction = (
  value: unknown,
  property: string,
  allowed: readonly string[] | undefined,
  required: boolean,
  node: MiniAppNode,
  context: ScreenContext,
): MiniAppAction | undefined => {
  const base = { screenKey: context.screen.key, nodeId: node.id, property }
  if (value === undefined || value === null) {
    if (required) {
      context.collector.add({ ...base, code: "action_required" })
    }
    return
  }
  const action = readAction(value)
  if (!(action && allowed?.includes(action.name))) {
    context.collector.add({ ...base, code: "action_not_allowed" })
    return
  }
  if (action.name === "complete" && !context.screen.terminal) {
    context.collector.add({ ...base, code: "complete_on_non_terminal" })
  }
  if (action.name === "navigate") {
    if (!context.screenKeys.has(action.next)) {
      context.collector.add({ ...base, code: "navigate_target_missing" })
    } else if (action.next === context.screen.key) {
      context.collector.add({ ...base, code: "navigate_self" })
    }
  }
  return action
}

const checkReferences = (
  text: string,
  property: string,
  node: MiniAppNode,
  context: ScreenContext,
) => {
  for (const { raw, reference } of extractReferences(text)) {
    const base = {
      screenKey: context.screen.key,
      nodeId: node.id,
      property,
      params: { reference: raw },
    }
    if (!reference) {
      context.collector.add({ ...base, code: "reference_invalid" })
      continue
    }
    if (reference.source === "data") {
      context.collector.add({ ...base, code: "data_reference_unsupported" })
      continue
    }
    const names = reference.screenId
      ? context.namesByScreenId.get(reference.screenId)
      : context.localNames
    if (!names?.has(reference.name)) {
      context.collector.add({ ...base, code: "reference_unknown" })
    }
  }
}

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
      if (key !== ACTION_KEY && key !== "src" && key !== "image") {
        forEachString(entry, path ? `${path}.${key}` : key, visit)
      }
    }
  }
}

const checkNodeProps = (node: MiniAppNode, context: ScreenContext) => {
  const definition = MINI_APP_COMPONENTS[node.type]
  const { collector, screen } = context
  const { [ACTION_KEY]: action, ...props } = node.props
  const parsed = definition.propsSchema.safeParse(cleanObject(props))
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      collector.add({
        screenKey: screen.key,
        nodeId: node.id,
        property: issue.path.map(String).join("."),
        ...zodIssueToCode(issue),
      })
    }
  }

  if (definition.isInput || NAMED_COMPONENT_TYPES.has(node.type)) {
    const name = node.props.name
    if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
      collector.add({
        screenKey: screen.key,
        nodeId: node.id,
        property: "name",
        code: "name_invalid",
      })
    }
  }

  for (const [minKey, maxKey] of MIN_MAX_PAIRS) {
    const min = node.props[minKey]
    const max = node.props[maxKey]
    const isGreater =
      (typeof min === "number" && typeof max === "number" && min > max) ||
      (typeof min === "string" && typeof max === "string" && min > max)
    if (isGreater) {
      collector.add({
        screenKey: screen.key,
        nodeId: node.id,
        property: minKey,
        code: "min_greater_than_max",
      })
    }
  }

  checkAction(
    action,
    ACTION_KEY,
    definition.actions,
    definition.actionRequired === true,
    node,
    context,
  )

  checkComponentRules(node, context)

  const items = node.props["list-items"]
  if (node.type === "NavigationList" && Array.isArray(items)) {
    items.forEach((item, index) => {
      checkAction(
        (item as Record<string, unknown>)?.[ACTION_KEY],
        `list-items.${index}.${ACTION_KEY}`,
        ["navigate"],
        true,
        node,
        context,
      )
    })
  }

  if (node.type === "If" || node.type === "Switch") {
    const property = node.type === "If" ? "condition" : "value"
    const expression = node.props[property]
    if (
      typeof expression === "string" &&
      expression.trim() &&
      !isValidExpression(expression)
    ) {
      collector.add({
        screenKey: screen.key,
        nodeId: node.id,
        property,
        code: "expression_invalid",
      })
    }
  }

  forEachString(props, "", (text, path) =>
    checkReferences(text, path, node, context),
  )
}

const containsFooter = (nodes: readonly MiniAppNode[]): boolean =>
  nodes.some((node) => node.type === "Footer")

const checkStructure = (screen: MiniAppScreen, context: ScreenContext) => {
  const { collector } = context
  const counts = new Map<string, number>()
  let total = 0
  let hasFooter = false
  let hasNavigationList = false
  let hasPhoto = false
  let hasDocument = false
  const seenNames = new Map<string, string>()

  walkNodes(screen.children, (visit) => {
    const { node, parent, slot, ifDepth, inConditional } = visit
    const base = { screenKey: screen.key, nodeId: node.id }
    total++
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1)

    if (parent && !canPlaceInSlot(parent.type, node.type)) {
      collector.add({
        ...base,
        code: "child_not_allowed",
        params: { parent: parent.type },
      })
    }

    if (node.type === "If" && ifDepth + 1 > MINI_APP_MAX_IF_DEPTH) {
      collector.add({
        ...base,
        code: "if_too_deep",
        params: { max: MINI_APP_MAX_IF_DEPTH },
      })
    }
    if (node.type === "If" && (node.slots?.then?.length ?? 0) === 0) {
      collector.add({ ...base, code: "if_then_empty" })
    }
    if (node.type === "Switch" && Object.keys(node.slots ?? {}).length === 0) {
      collector.add({ ...base, code: "switch_no_cases" })
    }

    if (node.type === "Footer") {
      hasFooter = true
      const siblings = parent
        ? (parent.slots?.[slot ?? ""] ?? [])
        : screen.children
      const isLast = siblings.at(-1)?.id === node.id
      if (inConditional) {
        // Footer is allowed only directly inside a first-level If branch.
        if (parent?.type !== "If" || ifDepth > 1) {
          collector.add({ ...base, code: "footer_in_nested_branch" })
        }
      } else if (!isLast) {
        collector.add({ ...base, code: "footer_not_last" })
      }
    }
    if (node.type === "If" && node.slots) {
      const thenHas = containsFooter(node.slots.then ?? [])
      const elseHas = containsFooter(node.slots.else ?? [])
      if (thenHas !== elseHas) {
        collector.add({ ...base, code: "footer_missing_in_branch" })
      }
    }
    if (node.type === "NavigationList") {
      hasNavigationList = true
    }
    if (node.type === "PhotoPicker") {
      hasPhoto = true
    }
    if (node.type === "DocumentPicker") {
      hasDocument = true
    }

    const name = node.props.name
    if (typeof name === "string" && name) {
      const owner = seenNames.get(name)
      if (owner && owner !== node.id) {
        collector.add({
          ...base,
          property: "name",
          code: "name_duplicate",
          params: { name },
        })
      }
      seenNames.set(name, node.id)
    }

    checkNodeProps(node, context)
  })

  if (total > MINI_APP_MAX_COMPONENTS_PER_SCREEN) {
    collector.add({
      screenKey: screen.key,
      code: "too_many_components",
      params: { max: MINI_APP_MAX_COMPONENTS_PER_SCREEN },
    })
  }
  for (const [type, count] of counts) {
    const max = MINI_APP_COMPONENTS[type as MiniAppNode["type"]].maxPerScreen
    // Footer is counted per branch: an If may hold one in each of then/else.
    if (max !== undefined && count > max && type !== "Footer") {
      collector.add({
        screenKey: screen.key,
        code: "component_limit",
        params: { type, max },
      })
    }
  }
  if (hasPhoto && hasDocument) {
    collector.add({ screenKey: screen.key, code: "picker_conflict" })
  }
  if (hasNavigationList && hasFooter) {
    collector.add({
      screenKey: screen.key,
      code: "navigation_list_with_footer",
    })
  }
  if (hasNavigationList && screen.terminal) {
    collector.add({
      screenKey: screen.key,
      code: "navigation_list_on_terminal",
    })
  }
  checkRootFooterCount(screen, collector)
}

/** At most one Footer may render: count root-level and Form-level Footers plus one per If. */
const checkRootFooterCount = (
  screen: MiniAppScreen,
  collector: IssueCollector,
) => {
  let footers = 0
  const countIn = (nodes: readonly MiniAppNode[]) => {
    for (const node of nodes) {
      if (node.type === "Footer") {
        footers++
      } else if (node.type === "Form") {
        countIn(node.slots?.children ?? [])
      } else if (node.type === "If" && containsFooter(node.slots?.then ?? [])) {
        footers++
      }
    }
  }
  countIn(screen.children)
  if (footers > 1) {
    collector.add({
      screenKey: screen.key,
      code: "component_limit",
      params: { type: "Footer", max: 1 },
    })
  }
}

const screenActions = (screen: MiniAppScreen): MiniAppAction[] => {
  const actions: MiniAppAction[] = []
  walkNodes(screen.children, ({ node }) => {
    const action = readAction(node.props[ACTION_KEY])
    if (action) {
      actions.push(action)
    }
    const items = node.props["list-items"]
    if (Array.isArray(items)) {
      for (const item of items) {
        const itemAction = readAction(
          (item as Record<string, unknown>)?.[ACTION_KEY],
        )
        if (itemAction) {
          actions.push(itemAction)
        }
      }
    }
  })
  return actions
}

const PICKER_MAX_KEY: Partial<Record<MiniAppNode["type"], string>> = {
  PhotoPicker: "max-uploaded-photos",
  DocumentPicker: "max-uploaded-documents",
}

const checkPickersInComplete = (
  definition: MiniAppDefinition,
  screen: MiniAppScreen,
  collector: IssueCollector,
) => {
  const onPath = collectPathScreens(definition, screen.key)
  for (const candidate of definition.screens) {
    if (!onPath.has(candidate.key)) {
      continue
    }
    walkNodes(candidate.children, ({ node }) => {
      const maxKey = PICKER_MAX_KEY[node.type]
      if (!maxKey) {
        return
      }
      const max = node.props[maxKey]
      if (typeof max !== "number" || max > 1) {
        collector.add({
          screenKey: candidate.key,
          nodeId: node.id,
          property: maxKey,
          code: "picker_multiple_in_complete",
        })
      }
    })
  }
}

const checkScreens = (
  definition: MiniAppDefinition,
  collector: IssueCollector,
) => {
  const seenIds = new Set<string>()
  for (const screen of definition.screens) {
    if (RESERVED_SCREEN_IDS.has(screen.id)) {
      collector.add({
        screenKey: screen.key,
        property: "id",
        code: "screen_id_reserved",
      })
    } else if (!SCREEN_ID_PATTERN.test(screen.id)) {
      collector.add({
        screenKey: screen.key,
        property: "id",
        code: "screen_id_invalid",
      })
    }
    if (seenIds.has(screen.id)) {
      collector.add({
        screenKey: screen.key,
        property: "id",
        code: "screen_id_duplicate",
      })
    }
    seenIds.add(screen.id)
  }

  const terminals = definition.screens.filter((screen) => screen.terminal)
  if (terminals.length === 0) {
    collector.add({ code: "no_terminal_screen" })
  }

  const reachable = new Set<string>()
  const queue = definition.screens[0] ? [definition.screens[0].key] : []
  while (queue.length > 0) {
    const key = queue.shift() as string
    if (reachable.has(key)) {
      continue
    }
    reachable.add(key)
    const screen = definition.screens.find((candidate) => candidate.key === key)
    for (const action of screen ? screenActions(screen) : []) {
      if (action.name === "navigate") {
        queue.push(action.next)
      }
    }
  }

  for (const screen of definition.screens) {
    const actions = screenActions(screen)
    if (screen.terminal) {
      if (actions.some((action) => action.name === "complete")) {
        checkPickersInComplete(definition, screen, collector)
      } else {
        collector.add({
          screenKey: screen.key,
          code: "terminal_screen_without_complete",
        })
      }
    } else if (!actions.some((action) => action.name === "navigate")) {
      collector.add({ screenKey: screen.key, code: "screen_without_exit" })
    }
    if (!reachable.has(screen.key)) {
      collector.add({
        screenKey: screen.key,
        code: "screen_unreachable",
        severity: "warning",
      })
    }
  }
}

/**
 * Checks a definition against Meta's Flow JSON rules. Errors block saving a
 * publishable flow; warnings are shown but do not block.
 */
export const validateMiniApp = (input: unknown): MiniAppValidationResult => {
  const collector = new IssueCollector()
  const parsed = miniAppDefinitionSchema.safeParse(input)
  if (!parsed.success) {
    collector.add({ code: "definition_invalid" })
    return { valid: false, issues: collector.issues }
  }
  const definition = parsed.data
  checkScreens(definition, collector)

  const screenKeys = new Set(definition.screens.map((screen) => screen.key))
  const namesByScreenId = new Map(
    definition.screens.map((screen) => [
      screen.id,
      new Set(collectInputNames(screen)),
    ]),
  )
  for (const screen of definition.screens) {
    checkStructure(screen, {
      definition,
      screen,
      screenKeys,
      localNames: namesByScreenId.get(screen.id) ?? new Set(),
      namesByScreenId,
      collector,
    })
  }

  // Names must be unique app-wide: answers are keyed by name.
  const owners = new Map<string, string>()
  for (const screen of definition.screens) {
    walkNodes(screen.children, ({ node }) => {
      const name = node.props.name
      if (
        !(
          MINI_APP_COMPONENTS[node.type].isInput &&
          typeof name === "string" &&
          name
        )
      ) {
        return
      }
      const ownerScreen = owners.get(name)
      if (ownerScreen && ownerScreen !== screen.key) {
        collector.add({
          screenKey: screen.key,
          nodeId: node.id,
          property: "name",
          code: "name_duplicate",
          params: { name },
        })
      }
      owners.set(name, screen.key)
    })
  }

  return {
    valid: !collector.issues.some((issue) => issue.severity === "error"),
    issues: collector.issues,
  }
}
