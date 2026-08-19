import type {
  DynamicImageElement,
  DynamicImageImageElement,
  DynamicImageQrCodeElement,
  DynamicImageTextElement,
} from "@chatbotx.io/database/partials"

export type DynamicImageElementType = DynamicImageElement["type"]

const DEFAULT_IMAGE_ELEMENT_SIZE = 100
const DEFAULT_TEXT_ELEMENT_WIDTH = 150
const DEFAULT_TEXT_ELEMENT_HEIGHT = 30
const DEFAULT_QR_CODE_ELEMENT_SIZE = 150
const DEFAULT_FONT_SIZE = 16
const DEFAULT_ELEMENT_COLOR = "#000000"

function createDefaultImageElement(): DynamicImageImageElement {
  return {
    id: crypto.randomUUID(),
    type: "image",
    imageType: "url",
    x: 0,
    y: 0,
    width: DEFAULT_IMAGE_ELEMENT_SIZE,
    height: DEFAULT_IMAGE_ELEMENT_SIZE,
    priority: false,
    imageStyle: "square",
  }
}

function createDefaultTextElement(): DynamicImageTextElement {
  return {
    id: crypto.randomUUID(),
    type: "text",
    x: 0,
    y: 0,
    width: DEFAULT_TEXT_ELEMENT_WIDTH,
    height: DEFAULT_TEXT_ELEMENT_HEIGHT,
    priority: false,
    text: "",
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: "arial",
    align: "left",
    color: DEFAULT_ELEMENT_COLOR,
    bold: false,
    italic: false,
    uppercase: false,
  }
}

function createDefaultQrCodeElement(): DynamicImageQrCodeElement {
  return {
    id: crypto.randomUUID(),
    type: "qrCode",
    x: 0,
    y: 0,
    width: DEFAULT_QR_CODE_ELEMENT_SIZE,
    height: DEFAULT_QR_CODE_ELEMENT_SIZE,
    priority: false,
    text: "",
    size: DEFAULT_QR_CODE_ELEMENT_SIZE,
    color: DEFAULT_ELEMENT_COLOR,
  }
}

export function createDefaultDynamicImageElement(
  type: DynamicImageElementType,
): DynamicImageElement {
  if (type === "image") {
    return createDefaultImageElement()
  }

  if (type === "text") {
    return createDefaultTextElement()
  }

  return createDefaultQrCodeElement()
}
