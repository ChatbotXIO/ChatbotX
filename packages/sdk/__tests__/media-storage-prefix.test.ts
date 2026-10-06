import { describe, expect, test } from "vitest"
import { getMediaStoragePrefix } from "../src"

describe("getMediaStoragePrefix", () => {
  test("uses the channel media prefix when the context carries one", () => {
    expect(
      getMediaStoragePrefix({
        storagePrefix: "public/ws/ws-1/2026/10/06",
        mediaStoragePrefix: "public/messenger/ws-1/int-1/2026/10/06",
      }),
    ).toBe("public/messenger/ws-1/int-1/2026/10/06")
  })

  test("falls back to the workspace prefix for contexts built without a channel", () => {
    expect(
      getMediaStoragePrefix({ storagePrefix: "public/ws/ws-1/2026/10/06" }),
    ).toBe("public/ws/ws-1/2026/10/06")
  })
})
