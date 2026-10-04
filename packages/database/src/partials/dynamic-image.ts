import { z } from "zod"

const elementBase = z.object({
  id: z
    .string()
    .describe(
      "Client-chosen unique id of this element within the document (any non-empty string, e.g. a UUID).",
    ),
  x: z
    .number()
    .describe(
      "Left edge of the element in pixels, measured from the canvas's left edge.",
    ),
  y: z
    .number()
    .describe(
      "Top edge of the element in pixels, measured from the canvas's top edge.",
    ),
  width: z.number().describe("Element box width in pixels."),
  height: z.number().describe("Element box height in pixels."),
  priority: z
    .boolean()
    .default(false)
    .describe(
      "For `url` image elements: true renders the image per request instead of baking it into the cached static background. Defaults to false.",
    ),
})

export const dynamicImageImageTypes = z.enum([
  "url",
  "avatarUser",
  "customField",
])
export type DynamicImageImageType = z.infer<typeof dynamicImageImageTypes>

export const dynamicImageStyles = z.enum(["square", "circle"])
export type DynamicImageStyle = z.infer<typeof dynamicImageStyles>

export const dynamicImageFontFamilies = z.enum([
  "arial",
  "serif",
  "roboto",
  "greatVibes",
])
export type DynamicImageFontFamily = z.infer<typeof dynamicImageFontFamilies>

export const dynamicImageTextAligns = z.enum(["left", "center", "right"])
export type DynamicImageTextAlign = z.infer<typeof dynamicImageTextAligns>

export const dynamicImageImageElement = elementBase.extend({
  type: z.literal("image").describe("Element kind: image."),
  imageType: dynamicImageImageTypes.describe(
    "Image source: `url` (fixed image from `url`), `avatarUser` (the contact's profile picture, resolved per request), or `customField` (image URL stored in the contact's custom field `customFieldId`).",
  ),
  url: z
    .string()
    .optional()
    .describe(
      "Public image URL. Required when `imageType` is `url`; ignored otherwise.",
    ),
  customFieldId: z
    .string()
    .optional()
    .describe(
      "Custom field id holding the image URL. Required when `imageType` is `customField`. Get it from `customFields.list`.",
    ),
  imageStyle: dynamicImageStyles
    .default("square")
    .describe(
      "Image mask: `square` (no clipping) or `circle` (clipped to a circle fitting the box). Defaults to `square`. The image is scaled to fit inside the box without cropping.",
    ),
})
export type DynamicImageImageElement = z.infer<typeof dynamicImageImageElement>

export const dynamicImageQrCodeElement = elementBase.extend({
  type: z.literal("qrCode").describe("Element kind: QR code."),
  text: z
    .string()
    .describe(
      "Content encoded in the QR code. May contain `{{variable}}` placeholders (e.g. `{{user_id}}`) resolved per contact.",
    ),
  size: z
    .number()
    .int()
    .min(64)
    .max(1024)
    .describe("Rendered QR code side length in pixels (64-1024)."),
  color: z
    .string()
    .describe(
      "QR module color as a CSS color string, e.g. `#000000`. Background is white.",
    ),
  logoUrl: z
    .string()
    .optional()
    .describe(
      "Optional public image URL drawn as a logo in the QR code center.",
    ),
})
export type DynamicImageQrCodeElement = z.infer<
  typeof dynamicImageQrCodeElement
>

export const dynamicImageTextElement = elementBase.extend({
  type: z.literal("text").describe("Element kind: text."),
  text: z
    .string()
    .describe(
      "Text to draw. May contain `{{variable}}` placeholders (e.g. `{{first_name}}`) resolved per contact; it word-wraps inside the element box and is clipped to it.",
    ),
  fontSize: z.number().describe("Font size in pixels."),
  fontFamily: dynamicImageFontFamilies.describe(
    "Font: `arial`, `serif`, `roboto` or `greatVibes`.",
  ),
  align: dynamicImageTextAligns.describe(
    "Horizontal alignment inside the element box: `left`, `center` or `right`.",
  ),
  color: z
    .string()
    .describe("Text color as a CSS color string, e.g. `#111111`."),
  bold: z.boolean().default(false).describe("Bold text. Defaults to false."),
  italic: z
    .boolean()
    .default(false)
    .describe("Italic text. Defaults to false."),
  uppercase: z
    .boolean()
    .default(false)
    .describe("Render the text in upper case. Defaults to false."),
})
export type DynamicImageTextElement = z.infer<typeof dynamicImageTextElement>

export const dynamicImageElement = z.discriminatedUnion("type", [
  dynamicImageImageElement,
  dynamicImageQrCodeElement,
  dynamicImageTextElement,
])
export type DynamicImageElement = z.infer<typeof dynamicImageElement>

export const dynamicImageDocument = z.object({
  width: z.number().int().positive().describe("Canvas width in pixels."),
  height: z.number().int().positive().describe("Canvas height in pixels."),
  elements: z
    .array(dynamicImageElement)
    .describe(
      "Layers drawn in array order, first at the bottom. Each is an image, qrCode or text element discriminated by `type`.",
    ),
})
export type DynamicImageDocument = z.infer<typeof dynamicImageDocument>
