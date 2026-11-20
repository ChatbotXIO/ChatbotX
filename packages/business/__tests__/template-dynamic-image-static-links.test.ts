// @vitest-environment node

import type { DynamicImageDocument } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { bakedLayerChanged } from "../src/template/adapters/dynamic-image-static-links"

const layer = (id: string, type: "text" | "qrCode", text: string) =>
  ({
    id,
    type,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    priority: false,
    size: 128,
    color: "#000000",
    fontSize: 16,
    fontFamily: "sans-serif",
    bold: false,
    italic: false,
    text,
  }) as unknown as DynamicImageDocument["elements"][number]

const documentOf = (
  ...elements: DynamicImageDocument["elements"]
): DynamicImageDocument => ({ width: 300, height: 300, elements })

const withText = (
  source: DynamicImageDocument,
  index: number,
  text: string,
): DynamicImageDocument => ({
  ...source,
  elements: source.elements.map((element, at) =>
    at === index ? ({ ...element, text } as typeof element) : element,
  ),
})

describe("bakedLayerChanged", () => {
  test("a static QR whose link followed a copy must be baked again", () => {
    const original = documentOf(layer("qr", "qrCode", "https://x.test/p?id=1"))
    expect(
      bakedLayerChanged(
        original,
        withText(original, 0, "https://x.test/p?id=2"),
      ),
    ).toBe(true)
  })

  test("a static text layer is baked too", () => {
    const original = documentOf(layer("t", "text", "see https://x.test/p?id=1"))
    expect(
      bakedLayerChanged(
        original,
        withText(original, 0, "see https://x.test/p?id=2"),
      ),
    ).toBe(true)
  })

  test("a per-contact layer is composited on every request and needs no new background", () => {
    const original = documentOf(
      layer("qr", "qrCode", "https://x.test/p?id=1&c={{contact.id}}"),
    )
    expect(
      bakedLayerChanged(
        original,
        withText(original, 0, "https://x.test/p?id=2&c={{contact.id}}"),
      ),
    ).toBe(false)
  })

  test("a static layer after the first dynamic one is dynamic too", () => {
    const original = documentOf(
      layer("name", "text", "{{contact.name}}"),
      layer("qr", "qrCode", "https://x.test/p?id=1"),
    )
    expect(
      bakedLayerChanged(
        original,
        withText(original, 1, "https://x.test/p?id=2"),
      ),
    ).toBe(false)
  })

  test("an unchanged document needs nothing", () => {
    const original = documentOf(layer("qr", "qrCode", "https://x.test/p?id=1"))
    expect(bakedLayerChanged(original, original)).toBe(false)
  })
})
