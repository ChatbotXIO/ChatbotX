// biome-ignore-all lint/suspicious/noThenProperty: `then` is the Flow JSON If branch key
import type { MiniAppComponentType } from "../types"
import { MINI_APP_COMPONENTS } from "./catalog"
import { MINI_APP_FIRST_SWITCH_CASE } from "./default-text"

/** Components Meta allows inside `If` branches (Footer only at the first If level). */
export const IF_ALLOWED_CHILDREN: ReadonlySet<MiniAppComponentType> = new Set([
  "TextHeading",
  "TextSubheading",
  "TextBody",
  "TextCaption",
  "CheckboxGroup",
  "ChipsSelector",
  "DatePicker",
  "Dropdown",
  "EmbeddedLink",
  "Footer",
  "Image",
  "OptIn",
  "RadioButtonsGroup",
  "Switch",
  "TextArea",
  "TextInput",
  "If",
])

/** Components Meta allows inside `Switch` cases. */
export const SWITCH_ALLOWED_CHILDREN: ReadonlySet<MiniAppComponentType> =
  new Set([
    "TextHeading",
    "TextSubheading",
    "TextBody",
    "TextCaption",
    "CheckboxGroup",
    "ChipsSelector",
    "DatePicker",
    "Dropdown",
    "EmbeddedLink",
    "Footer",
    "Image",
    "OptIn",
    "RadioButtonsGroup",
    "TextArea",
    "TextInput",
  ])

const FORM_DISALLOWED_CHILDREN: ReadonlySet<MiniAppComponentType> = new Set([
  "Form",
  "NavigationList",
])

/** Whether `child` may be placed into a slot of a container of `parentType`. */
export const canPlaceInSlot = (
  parentType: MiniAppComponentType | "Screen",
  child: MiniAppComponentType,
): boolean => {
  switch (parentType) {
    case "Screen":
      return true
    case "Form":
      return !FORM_DISALLOWED_CHILDREN.has(child)
    case "If":
      return IF_ALLOWED_CHILDREN.has(child)
    case "Switch":
      return SWITCH_ALLOWED_CHILDREN.has(child)
    default:
      return false
  }
}

/** Default slot keys for a freshly created container. */
export const defaultSlotsFor = (
  type: MiniAppComponentType,
): Record<string, []> | undefined => {
  switch (MINI_APP_COMPONENTS[type].slotKind) {
    case "form":
      return { children: [] }
    case "if":
      return { then: [], else: [] }
    case "switch":
      return { [MINI_APP_FIRST_SWITCH_CASE]: [] }
    default:
      return
  }
}
