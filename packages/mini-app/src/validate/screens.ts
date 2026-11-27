import { displayTextLength, hasContactVariable } from "../display-text"
import { collectPathScreens } from "../serialize"
import { findScreen, isTerminalScreen, screenActions, walkNodes } from "../tree"
import {
  MINI_APP_SCREEN_TITLE_MAX_LENGTH,
  type MiniAppDefinition,
  type MiniAppNode,
  type MiniAppScreen,
} from "../types"
import {
  MINI_APP_MAX_UPLOADS_PER_INPUT,
  MINI_APP_WHATSAPP_MAX_FILES_PER_RESPONSE,
} from "../uploads"
import type { IssueCollector } from "./issues"

const SCREEN_ID_PATTERN = /^[A-Za-z][A-Za-z_]*$/
const RESERVED_SCREEN_IDS = new Set(["SUCCESS"])

/** The prop holding a file picker's maximum number of files. */
const PICKER_MAX_FILES_PROP: Partial<Record<MiniAppNode["type"], string>> = {
  PhotoPicker: "max-uploaded-photos",
  DocumentPicker: "max-uploaded-documents",
}

const checkScreenTitle = (screen: MiniAppScreen, collector: IssueCollector) => {
  if (hasContactVariable(screen.title)) {
    collector.add({
      screenKey: screen.key,
      property: "title",
      code: "contact_variable_whatsapp",
      severity: "warning",
    })
  }
  if (displayTextLength(screen.title) > MINI_APP_SCREEN_TITLE_MAX_LENGTH) {
    collector.add({
      screenKey: screen.key,
      property: "title",
      code: "property_too_long",
      params: { max: MINI_APP_SCREEN_TITLE_MAX_LENGTH },
    })
  }
}

const checkScreenId = (
  screen: MiniAppScreen,
  seenIds: Set<string>,
  collector: IssueCollector,
) => {
  const report = (
    code: "screen_id_reserved" | "screen_id_invalid" | "screen_id_duplicate",
  ) => collector.add({ screenKey: screen.key, property: "id", code })
  if (RESERVED_SCREEN_IDS.has(screen.id)) {
    report("screen_id_reserved")
  } else if (!SCREEN_ID_PATTERN.test(screen.id)) {
    report("screen_id_invalid")
  }
  if (seenIds.has(screen.id)) {
    report("screen_id_duplicate")
  }
  seenIds.add(screen.id)
}

/** Screen keys the visitor can reach from the first screen. */
const collectReachableScreens = (
  definition: MiniAppDefinition,
): Set<string> => {
  const reachable = new Set<string>()
  const queue = definition.screens[0] ? [definition.screens[0].key] : []
  while (queue.length > 0) {
    const key = queue.shift() as string
    if (reachable.has(key)) {
      continue
    }
    reachable.add(key)
    const screen = findScreen(definition, key)
    for (const action of screen ? screenActions(screen) : []) {
      if (action.name === "navigate") {
        queue.push(action.next)
      }
    }
  }
  return reachable
}

/**
 * What a screen's pickers can add to a response. Meta states no maximum for a
 * picker in a Flow without an endpoint, so an unset one counts as the web
 * limit (this app's policy): the author must set it to publish.
 */
const screenPickerFiles = (screen: MiniAppScreen): number => {
  let total = 0
  walkNodes(screen.children, ({ node }) => {
    const maxProp = PICKER_MAX_FILES_PROP[node.type]
    if (maxProp) {
      const max = node.props[maxProp]
      total += typeof max === "number" ? max : MINI_APP_MAX_UPLOADS_PER_INPUT
    }
  })
  return total
}

const sumPickerFiles = (
  definition: MiniAppDefinition,
  screenKeys: ReadonlySet<string>,
): number =>
  definition.screens.reduce(
    (sum, screen) =>
      screenKeys.has(screen.key) ? sum + screenPickerFiles(screen) : sum,
    0,
  )

/**
 * Meta: "no more than 10 files can be attached" to a response message. A
 * completing screen's payload references the pickers of every screen that can
 * lead to it (`buildCompletePayload`), so all of them are counted: Meta does
 * not say what an unvisited screen's reference holds, so none is assumed empty.
 */
const checkPickersInComplete = (
  definition: MiniAppDefinition,
  collector: IssueCollector,
) => {
  for (const screen of definition.screens) {
    if (
      isTerminalScreen(screen) &&
      sumPickerFiles(definition, collectPathScreens(definition, screen.key)) >
        MINI_APP_WHATSAPP_MAX_FILES_PER_RESPONSE
    ) {
      collector.add({
        screenKey: screen.key,
        code: "picker_multiple_in_complete",
        params: { max: MINI_APP_WHATSAPP_MAX_FILES_PER_RESPONSE },
      })
    }
  }
}

/** Every screen either completes the flow or leads somewhere, and can be reached. */
const checkNavigation = (
  definition: MiniAppDefinition,
  collector: IssueCollector,
) => {
  if (!definition.screens.some(isTerminalScreen)) {
    collector.add({ code: "no_terminal_screen" })
  }
  checkPickersInComplete(definition, collector)
  const reachable = collectReachableScreens(definition)
  for (const screen of definition.screens) {
    const actions = screenActions(screen)
    if (
      !(
        actions.some((action) => action.name === "complete") ||
        actions.some((action) => action.name === "navigate")
      )
    ) {
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

/** Rules about the screens themselves: titles, ids and how they connect. */
export const checkScreens = (
  definition: MiniAppDefinition,
  collector: IssueCollector,
) => {
  const seenIds = new Set<string>()
  for (const screen of definition.screens) {
    checkScreenTitle(screen, collector)
    checkScreenId(screen, seenIds, collector)
  }
  checkNavigation(definition, collector)
}
