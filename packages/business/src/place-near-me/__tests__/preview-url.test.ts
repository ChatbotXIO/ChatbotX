import { describe, expect, test } from "vitest"
import { buildGoogleMapsPreviewUrl } from "../preview-url"

describe("buildGoogleMapsPreviewUrl", () => {
  test("keeps full coordinate precision", () => {
    expect(
      buildGoogleMapsPreviewUrl(16.007_884_630_447_4, 108.266_029_818_772_88),
    ).toBe(
      "https://www.google.com/maps/search/?api=1&query=16.0078846304474%2C108.26602981877288",
    )
  })

  test("keeps negative coordinates", () => {
    expect(buildGoogleMapsPreviewUrl(-33.8688, 151.2093)).toBe(
      "https://www.google.com/maps/search/?api=1&query=-33.8688%2C151.2093",
    )
  })
})
