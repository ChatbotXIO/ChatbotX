import { z } from "zod"
import { MINI_APP_MAX_UPLOADS_PER_INPUT } from "../uploads"
import {
  MINI_APP_MAX_FILE_SIZE_KB,
  MINI_APP_MAX_OPTION_IMAGE_BASE64_LENGTH,
  MINI_APP_MAX_OPTIONS,
} from "./limits"

/** Schema building blocks shared by the component props schemas. */

const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

export const requiredText = (max: number) => z.string().trim().min(1).max(max)
export const optionalText = (max: number) =>
  z.string().trim().min(1).max(max).optional()
export const base64Image = (max: number) =>
  z.string().max(max).regex(BASE64_REGEX)
export const isoDate = z.string().regex(DATE_REGEX)
export const fontWeight = z.enum(["bold", "italic", "bold_italic", "normal"])
export const scaleType = z.enum(["cover", "contain"])
export const mediaSize = z.enum(["regular", "large"])
export const visible = z.boolean().optional()

/** `min-selected-items` / `max-selected-items` of a CheckboxGroup or ChipsSelector. */
export const selectedItemsRange = {
  "min-selected-items": z
    .number()
    .int()
    .min(0)
    .max(MINI_APP_MAX_OPTIONS)
    .optional(),
  "max-selected-items": z
    .number()
    .int()
    .min(1)
    .max(MINI_APP_MAX_OPTIONS)
    .optional(),
}

/** `min-uploaded-*` (from 0) or `max-uploaded-*` (from 1) of a Photo/Document picker. */
export const uploadedFilesCount = (min: 0 | 1) =>
  z.number().int().min(min).max(MINI_APP_MAX_UPLOADS_PER_INPUT).optional()

export const maxFileSizeKb = z
  .number()
  .int()
  .min(1)
  .max(MINI_APP_MAX_FILE_SIZE_KB)
  .optional()

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

/** Selection options with unique ids. */
export const dataSource = (max: number, min = 1) =>
  z
    .array(miniAppOptionSchema)
    .min(min)
    .max(max)
    .refine(
      (items) => new Set(items.map((item) => item.id)).size === items.length,
      { message: "duplicate_option_id" },
    )

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

/** One image of an ImageCarousel's `images`. */
export type MiniAppImageItem = { src?: string; "alt-text"?: string }

// Meta rejects any property a component does not declare (INVALID_PROPERTY_KEY),
// so every props schema is strict and each input spreads only what it supports.
export const inputBase = {
  name: z.string(),
  required: z.boolean().optional(),
  enabled: z.boolean().optional(),
  visible,
}
const { enabled: _enabled, ...withoutEnabled } = inputBase
const { required: _required, ...withoutRequired } = inputBase
/** TextInput and OptIn have no `enabled`. */
export const inputWithoutEnabled = withoutEnabled
/** Photo/Document pickers use `min-uploaded-*` instead of `required`. */
export const pickerBase = withoutRequired

export const textProps = (max: number) =>
  z.strictObject({
    text: requiredText(max),
    "font-weight": fontWeight.optional(),
    strikethrough: z.boolean().optional(),
    markdown: z.boolean().optional(),
    visible,
  })
