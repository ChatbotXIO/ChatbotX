// biome-ignore-all lint/suspicious/noThenProperty: `then` is the Flow JSON If branch key
import { z } from "zod"
import type { MiniAppActionName, MiniAppComponentType } from "./types"

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

export type MiniAppDefaultTextKey =
  | "heading"
  | "subheading"
  | "body"
  | "caption"
  | "richText"
  | "textInputLabel"
  | "textAreaLabel"
  | "dropdownLabel"
  | "radioLabel"
  | "checkboxLabel"
  | "chipsLabel"
  | "dateLabel"
  | "calendarLabel"
  | "optInLabel"
  | "photoLabel"
  | "documentLabel"
  | "linkText"
  | "footerLabel"
  | "option"
  | "navigationItem"
  | "imageAlt"

export type MiniAppDefaultText = (key: MiniAppDefaultTextKey) => string

export const defaultMiniAppText: MiniAppDefaultText = (key) =>
  ({
    heading: "Heading",
    subheading: "Subheading",
    body: "Body text",
    caption: "Caption",
    richText: "## Title\n\nSome **rich** text.",
    textInputLabel: "Your answer",
    textAreaLabel: "Details",
    dropdownLabel: "Choose one",
    radioLabel: "Choose one",
    checkboxLabel: "Choose any",
    chipsLabel: "Choose any",
    dateLabel: "Date",
    calendarLabel: "Date",
    optInLabel: "I agree to the terms",
    photoLabel: "Upload photos",
    documentLabel: "Upload documents",
    linkText: "Learn more",
    footerLabel: "Continue",
    option: "Option",
    navigationItem: "Item",
    imageAlt: "Image",
  })[key]

/** A 1×1 light-grey PNG, used as the placeholder for new images. */
export const MINI_APP_PLACEHOLDER_IMAGE =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC"

/** Image payloads are base64 strings; ~300 KB of image ≈ 400 K characters. */
export const MINI_APP_MAX_IMAGE_BASE64_LENGTH = 410_000
/** Images inside selection options are capped at 100 KB by Meta. */
export const MINI_APP_MAX_OPTION_IMAGE_BASE64_LENGTH = 137_000

const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

const requiredText = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).optional()
const base64Image = (max: number) => z.string().max(max).regex(BASE64_REGEX)
const isoDate = z.string().regex(DATE_REGEX)
const fontWeight = z.enum(["bold", "italic", "bold_italic", "normal"])
const scaleType = z.enum(["cover", "contain"])
const visible = z.boolean().optional()

export const MINI_APP_MAX_OPTIONS = 20
export const MINI_APP_MAX_DROPDOWN_OPTIONS = 200

export const miniAppOptionSchema = z.strictObject({
  id: requiredText(80),
  title: requiredText(30),
  description: optionalText(300),
  metadata: optionalText(20),
  enabled: z.boolean().optional(),
  image: base64Image(MINI_APP_MAX_OPTION_IMAGE_BASE64_LENGTH).optional(),
  "alt-text": optionalText(100),
  color: z.string().regex(HEX_COLOR_REGEX).optional(),
})
export type MiniAppOption = z.infer<typeof miniAppOptionSchema>

const dataSource = (max: number, min = 1) =>
  z
    .array(miniAppOptionSchema)
    .min(min)
    .max(max)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      { message: "duplicate_option_id" },
    )

export const MINI_APP_MAX_NAVIGATION_ITEMS = 20

export const miniAppNavigationItemSchema = z.strictObject({
  id: requiredText(80),
  "main-content": z.strictObject({
    title: requiredText(30),
    description: optionalText(20),
    metadata: optionalText(80),
  }),
  start: z
    .strictObject({
      image: base64Image(MINI_APP_MAX_OPTION_IMAGE_BASE64_LENGTH),
      "alt-text": optionalText(100),
    })
    .optional(),
  end: z
    .strictObject({
      title: optionalText(10),
      description: optionalText(10),
      metadata: optionalText(10),
    })
    .optional(),
  badge: optionalText(15),
  tags: z.array(requiredText(15)).max(3).optional(),
  "on-click-action": z.unknown(),
})
export type MiniAppNavigationItem = z.infer<typeof miniAppNavigationItemSchema>

// Meta rejects any property a component does not declare (INVALID_PROPERTY_KEY),
// so every props schema is strict and each input spreads only what it supports.
const inputBase = {
  name: z.string(),
  required: z.boolean().optional(),
  enabled: z.boolean().optional(),
  visible,
}
/** TextInput and OptIn have no `enabled`. */
const { enabled: _enabled, ...inputWithoutEnabled } = inputBase
/** Photo/Document pickers use `min-uploaded-*` instead of `required`. */
const { required: _required, ...pickerBase } = inputBase

const textProps = (max: number) =>
  z.strictObject({
    text: requiredText(max),
    "font-weight": fontWeight.optional(),
    strikethrough: z.boolean().optional(),
    markdown: z.boolean().optional(),
    visible,
  })

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
        .enum(["text", "number", "email", "password", "passcode", "phone"])
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
      "media-size": z.enum(["regular", "large"]).optional(),
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
      "min-selected-items": z.number().int().min(0).max(20).optional(),
      "max-selected-items": z.number().int().min(1).max(20).optional(),
      "media-size": z.enum(["regular", "large"]).optional(),
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
      "min-selected-items": z.number().int().min(0).max(20).optional(),
      "max-selected-items": z.number().int().min(1).max(20).optional(),
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
      "max-file-size-kb": z.number().int().min(1).max(25_600).optional(),
      "min-uploaded-photos": z.number().int().min(0).max(30).optional(),
      "max-uploaded-photos": z.number().int().min(1).max(30).optional(),
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
      "max-file-size-kb": z.number().int().min(1).max(25_600).optional(),
      "min-uploaded-documents": z.number().int().min(0).max(30).optional(),
      "max-uploaded-documents": z.number().int().min(1).max(30).optional(),
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
      "media-size": z.enum(["regular", "large"]).optional(),
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

export const MINI_APP_MAX_COMPONENTS_PER_SCREEN = 50
export const MINI_APP_MAX_IF_DEPTH = 3

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
      return { case_1: [] }
    default:
      return
  }
}
