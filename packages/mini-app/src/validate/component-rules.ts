import { MINI_APP_MAX_DROPDOWN_OPTIONS_WITH_IMAGES } from "../components"
import type { MiniAppNode } from "../types"
import type { NodeReporter } from "./issues"

const hasText = (value: unknown) =>
  typeof value === "string" && value.trim() !== ""

const countWithText = (items: unknown, key: string): number =>
  Array.isArray(items)
    ? items.filter((item) => hasText((item as Record<string, unknown>)?.[key]))
        .length
    : 0

/** Either a center caption alone, or a left and right caption together. */
const checkFooterCaptions = (node: MiniAppNode, report: NodeReporter) => {
  const left = hasText(node.props["left-caption"])
  const right = hasText(node.props["right-caption"])
  const center = hasText(node.props["center-caption"])
  if ((center && (left || right)) || left !== right) {
    report({ property: "left-caption", code: "footer_captions_invalid" })
  }
}

const checkDropdownImages = (node: MiniAppNode, report: NodeReporter) => {
  const options = node.props["data-source"]
  if (
    Array.isArray(options) &&
    options.length > MINI_APP_MAX_DROPDOWN_OPTIONS_WITH_IMAGES &&
    countWithText(options, "image") > 0
  ) {
    report({
      property: "data-source",
      code: "options_with_images_limit",
      params: { max: MINI_APP_MAX_DROPDOWN_OPTIONS_WITH_IMAGES },
    })
  }
}

const checkNavigationBadges = (node: MiniAppNode, report: NodeReporter) => {
  if (countWithText(node.props["list-items"], "badge") > 1) {
    report({ property: "list-items", code: "navigation_badge_multiple" })
  }
}

/** Cross-property rules Meta enforces that a per-property schema cannot express. */
export const checkComponentRules = (
  node: MiniAppNode,
  report: NodeReporter,
) => {
  switch (node.type) {
    case "Footer":
      checkFooterCaptions(node, report)
      break
    case "Dropdown":
      checkDropdownImages(node, report)
      break
    case "NavigationList":
      checkNavigationBadges(node, report)
      break
    default:
      break
  }
}
