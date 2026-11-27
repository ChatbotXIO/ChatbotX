import type { DynamicImageDocument } from "@chatbotx.io/database/partials"
import { getDynamicElementIds } from "../../dynamic-image/render"

/**
 * Whether rewriting the document changed a layer that is baked into the
 * static background (a `text` or `qrCode` layer in the leading run of static
 * layers: no `{{variable}}`, so `renderStaticLayer` paints it once at save
 * time). Such a change is invisible until the background is rendered again;
 * a changed per-contact layer is composited on every request and needs nothing.
 * Judged on the ORIGINAL document, like `getDynamicElementIds` requires.
 */
export const bakedLayerChanged = (
  original: DynamicImageDocument,
  rewritten: DynamicImageDocument,
): boolean => {
  const dynamicIds = getDynamicElementIds(original)
  return original.elements.some((element, index) => {
    if (dynamicIds.has(element.id)) {
      return false
    }
    if (element.type !== "text" && element.type !== "qrCode") {
      return false
    }
    const next = rewritten.elements[index]
    return (
      next !== undefined &&
      (next.type === "text" || next.type === "qrCode") &&
      next.text !== element.text
    )
  })
}
