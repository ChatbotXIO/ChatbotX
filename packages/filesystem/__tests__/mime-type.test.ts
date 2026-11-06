import { describe, expect, test } from "vitest"
import { normalizeMimeType } from "../src/lib/mime-type"

describe("normalizeMimeType", () => {
  test.each([
    ["image/jpg", "image/jpeg"],
    ["image/pjpeg", "image/jpeg"],
    ["image/x-png", "image/png"],
    ["IMAGE/JPG", "image/jpeg"],
    [" image/jpg ", "image/jpeg"],
  ])("maps the non-standard %s to %s", (input, expected) => {
    expect(normalizeMimeType(input)).toBe(expected)
  })

  test.each([
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
    "application/octet-stream",
  ])("leaves the registered type %s unchanged", (mimeType) => {
    expect(normalizeMimeType(mimeType)).toBe(mimeType)
  })

  test("keeps parameters after the base type", () => {
    expect(normalizeMimeType("text/plain; charset=utf-8")).toBe(
      "text/plain; charset=utf-8",
    )
    expect(normalizeMimeType("image/jpg;q=1")).toBe("image/jpeg;q=1")
  })
})
