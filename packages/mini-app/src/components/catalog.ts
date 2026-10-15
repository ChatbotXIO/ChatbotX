import { z } from "zod"
import type { MiniAppActionName, MiniAppComponentType } from "../types"
import {
  MINI_APP_PLACEHOLDER_IMAGE,
  type MiniAppDefaultText,
} from "./default-text"
import {
  base64Image,
  dataSource,
  inputBase,
  inputWithoutEnabled,
  isoDate,
  maxFileSizeKb,
  mediaSize,
  miniAppNavigationItemSchema,
  optionalText,
  pickerBase,
  requiredText,
  scaleType,
  selectedItemsRange,
  textProps,
  uploadedFilesCount,
  visible,
} from "./fields"
import {
  MINI_APP_MAX_DROPDOWN_OPTIONS,
  MINI_APP_MAX_IMAGE_BASE64_LENGTH,
  MINI_APP_MAX_NAVIGATION_ITEMS,
  MINI_APP_MAX_OPTIONS,
} from "./limits"

/**
 * Component catalog, following Meta's Flow JSON 7.3 component reference.
 * Character limits are Meta's; where the reference gives none, a generous cap
 * keeps stored payloads bounded.
 */

export type MiniAppComponentCategory =
  | "text"
  | "input"
  | "selection"
  | "media"
  | "navigation"
  | "container"

export type MiniAppSlotKind = "form" | "if" | "switch"

export interface MiniAppComponentDefinition {
  actionRequired?: boolean
  /** Actions allowed on `on-click-action`; absent = the node takes no action. */
  actions?: readonly MiniAppActionName[]
  category: MiniAppComponentCategory
  defaultProps: (text: MiniAppDefaultText) => Record<string, unknown>
  /** Has a `name` and contributes a value to the submitted answers. */
  isInput: boolean
  maxPerScreen?: number
  propsSchema: z.ZodType<Record<string, unknown>>
  slotKind?: MiniAppSlotKind
  type: MiniAppComponentType
}

const defaultOptions = (text: MiniAppDefaultText, count = 2) =>
  Array.from({ length: count }, (_, index) => ({
    id: `option_${index + 1}`,
    title: `${text("option")} ${index + 1}`,
  }))

const definitions: MiniAppComponentDefinition[] = [
  {
    type: "TextHeading",
    category: "text",
    isInput: false,
    propsSchema: z.strictObject({ text: requiredText(80), visible }),
    defaultProps: (text) => ({ text: text("heading") }),
  },
  {
    type: "TextSubheading",
    category: "text",
    isInput: false,
    propsSchema: z.strictObject({ text: requiredText(80), visible }),
    defaultProps: (text) => ({ text: text("subheading") }),
  },
  {
    type: "TextBody",
    category: "text",
    isInput: false,
    propsSchema: textProps(4096),
    defaultProps: (text) => ({ text: text("body") }),
  },
  {
    type: "TextCaption",
    category: "text",
    isInput: false,
    propsSchema: textProps(409),
    defaultProps: (text) => ({ text: text("caption") }),
  },
  {
    type: "RichText",
    category: "text",
    isInput: false,
    propsSchema: z.strictObject({ text: requiredText(10_000), visible }),
    defaultProps: (text) => ({ text: text("richText") }),
  },
  {
    type: "TextInput",
    category: "input",
    isInput: true,
    propsSchema: z.strictObject({
      ...inputWithoutEnabled,
      label: requiredText(20),
      "label-variant": z.enum(["large"]).optional(),
      "input-type": z
        .enum([
          "text",
          "number",
          "email",
          "password",
          "passcode",
          "phone",
          "date",
          "datetime",
        ])
        .optional(),
      pattern: optionalText(500),
      "min-chars": z.number().int().min(0).max(80).optional(),
      "max-chars": z.number().int().min(1).max(80).optional(),
      "helper-text": optionalText(80),
      "init-value": optionalText(80),
      "error-message": optionalText(30),
    }),
    defaultProps: (text) => ({
      label: text("textInputLabel"),
      "input-type": "text",
      required: false,
    }),
  },
  {
    type: "TextArea",
    category: "input",
    isInput: true,
    propsSchema: z.strictObject({
      ...inputBase,
      label: requiredText(20),
      "label-variant": z.enum(["large"]).optional(),
      "max-length": z.number().int().min(1).max(600).optional(),
      "helper-text": optionalText(80),
      "init-value": optionalText(600),
      "error-message": optionalText(30),
    }),
    defaultProps: (text) => ({ label: text("textAreaLabel"), required: false }),
  },
  {
    type: "Dropdown",
    category: "selection",
    isInput: true,
    propsSchema: z.strictObject({
      ...inputBase,
      label: requiredText(20),
      "data-source": dataSource(MINI_APP_MAX_DROPDOWN_OPTIONS),
      "init-value": optionalText(80),
      "error-message": optionalText(30),
    }),
    defaultProps: (text) => ({
      label: text("dropdownLabel"),
      "data-source": defaultOptions(text, 3),
      required: false,
    }),
  },
  {
    type: "RadioButtonsGroup",
    category: "selection",
    isInput: true,
    propsSchema: z.strictObject({
      ...inputBase,
      label: requiredText(30),
      description: optionalText(300),
      "data-source": dataSource(MINI_APP_MAX_OPTIONS),
      "media-size": mediaSize.optional(),
      "init-value": optionalText(80),
      "error-message": optionalText(30),
    }),
    defaultProps: (text) => ({
      label: text("radioLabel"),
      "data-source": defaultOptions(text),
      required: false,
    }),
  },
  {
    type: "CheckboxGroup",
    category: "selection",
    isInput: true,
    propsSchema: z.strictObject({
      ...inputBase,
      label: requiredText(30),
      description: optionalText(300),
      "data-source": dataSource(MINI_APP_MAX_OPTIONS),
      ...selectedItemsRange,
      "media-size": mediaSize.optional(),
      "init-value": z.array(z.string()).optional(),
      "error-message": optionalText(30),
    }),
    defaultProps: (text) => ({
      label: text("checkboxLabel"),
      "data-source": defaultOptions(text),
      required: false,
    }),
  },
  {
    type: "ChipsSelector",
    category: "selection",
    isInput: true,
    propsSchema: z.strictObject({
      ...inputBase,
      label: requiredText(80),
      description: optionalText(300),
      "data-source": dataSource(MINI_APP_MAX_OPTIONS, 2),
      ...selectedItemsRange,
      "init-value": z.array(z.string()).optional(),
      "error-message": optionalText(30),
    }),
    defaultProps: (text) => ({
      label: text("chipsLabel"),
      "data-source": defaultOptions(text, 3),
      required: false,
    }),
  },
  {
    type: "DatePicker",
    category: "input",
    isInput: true,
    propsSchema: z.strictObject({
      ...inputBase,
      label: requiredText(40),
      "helper-text": optionalText(80),
      "min-date": isoDate.optional(),
      "max-date": isoDate.optional(),
      "unavailable-dates": z.array(isoDate).max(366).optional(),
      "init-value": isoDate.optional(),
      "error-message": optionalText(80),
    }),
    defaultProps: (text) => ({ label: text("dateLabel"), required: false }),
  },
  {
    type: "CalendarPicker",
    category: "input",
    isInput: true,
    propsSchema: z.strictObject({
      ...inputBase,
      label: requiredText(40),
      title: optionalText(80),
      description: optionalText(300),
      "helper-text": optionalText(80),
      mode: z.enum(["single", "range"]).optional(),
      "min-date": isoDate.optional(),
      "max-date": isoDate.optional(),
      "unavailable-dates": z.array(isoDate).max(366).optional(),
      "include-days": z
        .array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]))
        .optional(),
      "min-days": z.number().int().min(1).optional(),
      "max-days": z.number().int().min(1).optional(),
      "error-message": optionalText(80),
    }),
    defaultProps: (text) => ({
      label: text("calendarLabel"),
      mode: "single",
      required: false,
    }),
  },
  {
    type: "OptIn",
    category: "selection",
    isInput: true,
    maxPerScreen: 5,
    propsSchema: z.strictObject({
      ...inputWithoutEnabled,
      label: requiredText(120),
      "init-value": z.boolean().optional(),
    }),
    actions: ["navigate", "open_url"],
    defaultProps: (text) => ({ label: text("optInLabel"), required: false }),
  },
  {
    type: "PhotoPicker",
    category: "input",
    isInput: true,
    maxPerScreen: 1,
    propsSchema: z.strictObject({
      ...pickerBase,
      label: requiredText(80),
      description: optionalText(300),
      "photo-source": z
        .enum(["camera_gallery", "camera", "gallery"])
        .optional(),
      "max-file-size-kb": maxFileSizeKb,
      "min-uploaded-photos": uploadedFilesCount(0),
      "max-uploaded-photos": uploadedFilesCount(1),
      "error-message": optionalText(80),
    }),
    defaultProps: (text) => ({
      label: text("photoLabel"),
      "max-uploaded-photos": 1,
    }),
  },
  {
    type: "DocumentPicker",
    category: "input",
    isInput: true,
    maxPerScreen: 1,
    propsSchema: z.strictObject({
      ...pickerBase,
      label: requiredText(80),
      description: optionalText(300),
      "max-file-size-kb": maxFileSizeKb,
      "min-uploaded-documents": uploadedFilesCount(0),
      "max-uploaded-documents": uploadedFilesCount(1),
      "allowed-mime-types": z.array(requiredText(120)).max(30).optional(),
      "error-message": optionalText(80),
    }),
    defaultProps: (text) => ({
      label: text("documentLabel"),
      "max-uploaded-documents": 1,
    }),
  },
  {
    type: "Image",
    category: "media",
    isInput: false,
    maxPerScreen: 3,
    propsSchema: z.strictObject({
      src: base64Image(MINI_APP_MAX_IMAGE_BASE64_LENGTH),
      width: z.number().int().min(1).max(2000).optional(),
      height: z.number().int().min(1).max(2000).optional(),
      "scale-type": scaleType.optional(),
      "aspect-ratio": z.number().positive().max(10).optional(),
      "alt-text": optionalText(100),
      visible,
    }),
    defaultProps: (text) => ({
      src: MINI_APP_PLACEHOLDER_IMAGE,
      height: 120,
      "scale-type": "cover",
      "alt-text": text("imageAlt"),
    }),
  },
  {
    type: "ImageCarousel",
    category: "media",
    isInput: false,
    maxPerScreen: 2,
    propsSchema: z.strictObject({
      images: z
        .array(
          z.object({
            src: base64Image(MINI_APP_MAX_IMAGE_BASE64_LENGTH),
            "alt-text": optionalText(100),
          }),
        )
        .min(1)
        .max(3),
      "scale-type": scaleType.optional(),
      "aspect-ratio": z.number().positive().max(10).optional(),
      visible,
    }),
    defaultProps: (text) => ({
      images: [
        {
          src: MINI_APP_PLACEHOLDER_IMAGE,
          "alt-text": `${text("imageAlt")} 1`,
        },
        {
          src: MINI_APP_PLACEHOLDER_IMAGE,
          "alt-text": `${text("imageAlt")} 2`,
        },
      ],
      "scale-type": "cover",
    }),
  },
  {
    type: "EmbeddedLink",
    category: "navigation",
    isInput: false,
    maxPerScreen: 2,
    propsSchema: z.strictObject({ text: requiredText(25), visible }),
    actions: ["navigate", "open_url"],
    actionRequired: true,
    defaultProps: (text) => ({ text: text("linkText") }),
  },
  {
    type: "NavigationList",
    category: "navigation",
    isInput: false,
    maxPerScreen: 2,
    propsSchema: z.strictObject({
      name: z.string(),
      "list-items": z
        .array(miniAppNavigationItemSchema)
        .min(1)
        .max(MINI_APP_MAX_NAVIGATION_ITEMS),
      "media-size": mediaSize.optional(),
      visible,
    }),
    defaultProps: (text) => ({
      "list-items": [1, 2].map((index) => ({
        id: `item_${index}`,
        "main-content": { title: `${text("navigationItem")} ${index}` },
      })),
    }),
  },
  {
    type: "Footer",
    category: "navigation",
    isInput: false,
    maxPerScreen: 1,
    propsSchema: z.strictObject({
      label: requiredText(35),
      "left-caption": optionalText(15),
      "center-caption": optionalText(15),
      "right-caption": optionalText(15),
      enabled: z.boolean().optional(),
    }),
    actions: ["navigate", "complete"],
    actionRequired: true,
    defaultProps: (text) => ({ label: text("footerLabel") }),
  },
  {
    type: "Form",
    category: "container",
    isInput: false,
    slotKind: "form",
    propsSchema: z.strictObject({ name: z.string() }),
    defaultProps: () => ({}),
  },
  {
    type: "If",
    category: "container",
    isInput: false,
    slotKind: "if",
    propsSchema: z.strictObject({ condition: requiredText(500) }),
    defaultProps: () => ({ condition: "" }),
  },
  {
    type: "Switch",
    category: "container",
    isInput: false,
    slotKind: "switch",
    propsSchema: z.strictObject({ value: requiredText(200) }),
    defaultProps: () => ({ value: "" }),
  },
]

export const MINI_APP_COMPONENTS: Readonly<
  Record<MiniAppComponentType, MiniAppComponentDefinition>
> = Object.fromEntries(
  definitions.map((definition) => [definition.type, definition]),
) as Record<MiniAppComponentType, MiniAppComponentDefinition>

export const MINI_APP_COMPONENT_LIST: readonly MiniAppComponentDefinition[] =
  definitions

export const MINI_APP_COMPONENT_CATEGORIES: readonly MiniAppComponentCategory[] =
  ["text", "input", "selection", "media", "navigation", "container"]

/** Components that also need a `name`, even though they are not inputs. */
export const NAMED_COMPONENT_TYPES: ReadonlySet<MiniAppComponentType> = new Set(
  ["Form", "NavigationList"],
)

/** Whether a component of this type carries a `name`. */
export const needsName = (type: MiniAppComponentType): boolean =>
  MINI_APP_COMPONENTS[type].isInput || NAMED_COMPONENT_TYPES.has(type)
