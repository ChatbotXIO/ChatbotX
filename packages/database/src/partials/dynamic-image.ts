import { z } from "zod"

const elementBase = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  priority: z.boolean().default(false),
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
  type: z.literal("image"),
  imageType: dynamicImageImageTypes,
  url: z.string().optional(),
  customFieldId: z.string().optional(),
  imageStyle: dynamicImageStyles.default("square"),
})
export type DynamicImageImageElement = z.infer<typeof dynamicImageImageElement>

export const dynamicImageQrCodeElement = elementBase.extend({
  type: z.literal("qrCode"),
  text: z.string(),
  size: z.number().int().min(64).max(1024),
  color: z.string(),
  logoUrl: z.string().optional(),
})
export type DynamicImageQrCodeElement = z.infer<
  typeof dynamicImageQrCodeElement
>

export const dynamicImageTextElement = elementBase.extend({
  type: z.literal("text"),
  text: z.string(),
  fontSize: z.number(),
  fontFamily: dynamicImageFontFamilies,
  align: dynamicImageTextAligns,
  color: z.string(),
  bold: z.boolean().default(false),
  italic: z.boolean().default(false),
  uppercase: z.boolean().default(false),
})
export type DynamicImageTextElement = z.infer<typeof dynamicImageTextElement>

export const dynamicImageElement = z.discriminatedUnion("type", [
  dynamicImageImageElement,
  dynamicImageQrCodeElement,
  dynamicImageTextElement,
])
export type DynamicImageElement = z.infer<typeof dynamicImageElement>

export const dynamicImageDocument = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  elements: z.array(dynamicImageElement),
})
export type DynamicImageDocument = z.infer<typeof dynamicImageDocument>
