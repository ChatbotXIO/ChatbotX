// @vitest-environment node

import { afterEach, describe, expect, test, vi } from "vitest"

const BUILDER_URL = "https://app.taunguyen.site"

async function loadWith(envOverrides: Record<string, string | undefined> = {}) {
  vi.resetModules()
  vi.doMock("@/env", () => ({
    env: {
      NEXT_PUBLIC_BUILDER_URL: BUILDER_URL,
      ...envOverrides,
    },
  }))
  return await import("../dynamic-image-url")
}

afterEach(() => {
  vi.resetModules()
  vi.doUnmock("@/env")
})

describe("extractDynamicImageId", () => {
  test("returns the dynamicImageId for a dynamic-image trigger URL on our own origin", async () => {
    const { extractDynamicImageId } = await loadWith()

    expect(
      extractDynamicImageId(
        `${BUILDER_URL}/dynamic-images?dynamicImageId=11657492274741248&userId={{user_id}}`,
      ),
    ).toBe("11657492274741248")
  })

  test("returns null for a regular https image URL", async () => {
    const { extractDynamicImageId } = await loadWith()

    expect(
      extractDynamicImageId("https://cdn.example.com/photo.png"),
    ).toBeNull()
  })

  test("returns null for a path that isn't /dynamic-images", async () => {
    const { extractDynamicImageId } = await loadWith()

    expect(
      extractDynamicImageId(`${BUILDER_URL}/other-path?dynamicImageId=123`),
    ).toBeNull()
  })

  test("returns null for the right path on a different origin", async () => {
    const { extractDynamicImageId } = await loadWith()

    expect(
      extractDynamicImageId(
        "https://evil.example.com/dynamic-images?dynamicImageId=123",
      ),
    ).toBeNull()
  })

  test("returns null for an invalid URL", async () => {
    const { extractDynamicImageId } = await loadWith()

    expect(extractDynamicImageId("not-a-url")).toBeNull()
  })

  test("returns null for undefined", async () => {
    const { extractDynamicImageId } = await loadWith()

    expect(extractDynamicImageId(undefined)).toBeNull()
  })
})
