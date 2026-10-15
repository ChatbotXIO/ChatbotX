import {
  canPlaceInSlot,
  MINI_APP_COMPONENTS,
  MINI_APP_MAX_COMPONENTS_PER_SCREEN,
  MINI_APP_MAX_IF_DEPTH,
} from "../components"
import {
  isTerminalScreen,
  type MiniAppNodeVisit,
  nodeName,
  walkNodes,
} from "../tree"
import type { MiniAppComponentType, MiniAppNode, MiniAppScreen } from "../types"
import {
  type IssueCollector,
  type NodeReporter,
  nodeReporter,
  type ScreenContext,
} from "./issues"
import { checkNodeProps } from "./node-props"

const containsFooter = (nodes: readonly MiniAppNode[]): boolean =>
  nodes.some((node) => node.type === "Footer")

/** Rules about where a node sits: its container, If nesting and empty branches. */
const checkPlacement = (visit: MiniAppNodeVisit, report: NodeReporter) => {
  const { node, parent, ifDepth } = visit
  if (parent && !canPlaceInSlot(parent.type, node.type)) {
    report({ code: "child_not_allowed", params: { parent: parent.type } })
  }
  if (node.type === "If" && ifDepth + 1 > MINI_APP_MAX_IF_DEPTH) {
    report({ code: "if_too_deep", params: { max: MINI_APP_MAX_IF_DEPTH } })
  }
  if (node.type === "If" && (node.slots?.then?.length ?? 0) === 0) {
    report({ code: "if_then_empty" })
  }
  if (node.type === "Switch" && Object.keys(node.slots ?? {}).length === 0) {
    report({ code: "switch_no_cases" })
  }
}

/**
 * A Footer is the last node of the screen, or sits directly in a first-level
 * If branch; an If with a Footer in one branch needs one in the other too.
 */
const checkFooterPosition = (
  visit: MiniAppNodeVisit,
  screen: MiniAppScreen,
  report: NodeReporter,
) => {
  const { node, parent, slot, ifDepth, inConditional } = visit
  if (node.type === "Footer") {
    const siblings = parent
      ? (parent.slots?.[slot ?? ""] ?? [])
      : screen.children
    if (inConditional) {
      if (parent?.type !== "If" || ifDepth > 1) {
        report({ code: "footer_in_nested_branch" })
      }
    } else if (siblings.at(-1)?.id !== node.id) {
      report({ code: "footer_not_last" })
    }
  }
  if (node.type === "If" && node.slots) {
    const thenHas = containsFooter(node.slots.then ?? [])
    const elseHas = containsFooter(node.slots.else ?? [])
    if (thenHas !== elseHas) {
      report({ code: "footer_missing_in_branch" })
    }
  }
}

/** Limits on how many of each component a screen holds, and which may not be combined. */
const checkScreenComposition = (
  screen: MiniAppScreen,
  counts: Map<MiniAppComponentType, number>,
  collector: IssueCollector,
) => {
  const report = (issue: Parameters<IssueCollector["add"]>[0]) =>
    collector.add({ screenKey: screen.key, ...issue })
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0)
  if (total > MINI_APP_MAX_COMPONENTS_PER_SCREEN) {
    report({
      code: "too_many_components",
      params: { max: MINI_APP_MAX_COMPONENTS_PER_SCREEN },
    })
  }
  for (const [type, count] of counts) {
    const max = MINI_APP_COMPONENTS[type].maxPerScreen
    // Footer is counted per branch by `checkSingleFooter`.
    if (max !== undefined && count > max && type !== "Footer") {
      report({ code: "component_limit", params: { type, max } })
    }
  }
  if (counts.has("PhotoPicker") && counts.has("DocumentPicker")) {
    report({ code: "picker_conflict" })
  }
  if (counts.has("NavigationList") && counts.has("Footer")) {
    report({ code: "navigation_list_with_footer" })
  }
  if (counts.has("NavigationList") && isTerminalScreen(screen)) {
    report({ code: "navigation_list_on_terminal" })
  }
}

/**
 * At most one Footer may render. Footers at the screen root and inside Forms
 * count one each; an If counts once, as only one of its branches renders.
 */
const checkSingleFooter = (
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

/** Every rule about one screen's nodes: placement, names, props and limits. */
export const checkStructure = (context: ScreenContext) => {
  const { collector, screen } = context
  const counts = new Map<MiniAppComponentType, number>()
  const nodeIdByName = new Map<string, string>()

  walkNodes(screen.children, (visit) => {
    const { node } = visit
    const report = nodeReporter(context, node)
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1)
    checkPlacement(visit, report)
    checkFooterPosition(visit, screen, report)

    const name = nodeName(node)
    if (name) {
      const owner = nodeIdByName.get(name)
      if (owner && owner !== node.id) {
        report({ property: "name", code: "name_duplicate", params: { name } })
      }
      nodeIdByName.set(name, node.id)
    }

    checkNodeProps(node, context)
  })

  checkScreenComposition(screen, counts, collector)
  checkSingleFooter(screen, collector)
}
