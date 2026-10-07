import { isFileAnswer } from "./answers"
import { MINI_APP_COMPONENTS } from "./components"
import { walkNodes } from "./tree"
import type { MiniAppComponentType, MiniAppDefinition } from "./types"

/** Every input can feed a custom field; file inputs store their public URLs. */
export const canMapToCustomField = (type: MiniAppComponentType): boolean =>
  MINI_APP_COMPONENTS[type].isInput

/** Input name → custom field id, for every mapped input. */
export const collectCustomFieldMappings = (
  definition: MiniAppDefinition,
): Record<string, string> => {
  const mappings: Record<string, string> = {}
  for (const screen of definition.screens) {
    walkNodes(screen.children, ({ node }) => {
      const name = node.props.name
      if (
        node.customFieldId &&
        canMapToCustomField(node.type) &&
        typeof name === "string" &&
        name
      ) {
        mappings[name] = node.customFieldId
      }
    })
  }
  return mappings
}

/**
 * Sets the mapping of every input named in `mappings` (`null` clears one).
 * Inputs not named are left as they are; unknown names are ignored.
 */
export const applyCustomFieldMappings = (
  definition: MiniAppDefinition,
  mappings: Readonly<Record<string, string | null>>,
): MiniAppDefinition => {
  const next = structuredClone(definition)
  for (const screen of next.screens) {
    walkNodes(screen.children, ({ node }) => {
      const name = node.props.name
      if (
        !(
          typeof name === "string" &&
          name in mappings &&
          canMapToCustomField(node.type)
        )
      ) {
        return
      }
      const customFieldId = mappings[name]
      if (customFieldId) {
        node.customFieldId = customFieldId
      } else {
        node.customFieldId = undefined
      }
    })
  }
  return next
}

/**
 * The text stored in a custom field for one answer. Selections keep their
 * option ids (like WhatsApp Flow responses); several values — option ids or
 * uploaded files' public URLs — are comma-joined and a date range becomes
 * `start - end`.
 */
export const formatAnswerForCustomField = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") {
    return null
  }
  if (isFileAnswer(value)) {
    return value.map((file) => file.url).join(", ")
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(String).join(", ") : null
  }
  if (typeof value === "object") {
    const range = value as Record<string, unknown>
    const start = range["start-date"]
    const end = range["end-date"]
    return typeof start === "string" && typeof end === "string"
      ? `${start} - ${end}`
      : null
  }
  return String(value)
}
