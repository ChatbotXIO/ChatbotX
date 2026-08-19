import type { DynamicImageDocument } from "@chatbotx.io/database/partials"

export const DEFAULT_DYNAMIC_IMAGE_WIDTH = 500
export const DEFAULT_DYNAMIC_IMAGE_HEIGHT = 320

export const DEFAULT_DYNAMIC_IMAGE_DOCUMENT: DynamicImageDocument = {
  width: DEFAULT_DYNAMIC_IMAGE_WIDTH,
  height: DEFAULT_DYNAMIC_IMAGE_HEIGHT,
  elements: [],
}

export const DYNAMIC_IMAGE_TEMPLATE_WIDTH = 600
export const DYNAMIC_IMAGE_TEMPLATE_HEIGHT = 360

export const DYNAMIC_IMAGE_TEMPLATES = [
  { id: "template-1", url: "/dynamic-image/template-1.png" },
  { id: "template-2", url: "/dynamic-image/template-2.png" },
  { id: "template-3", url: "/dynamic-image/template-3.png" },
  { id: "template-4", url: "/dynamic-image/template-4.png" },
] as const
