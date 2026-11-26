import { expect, test } from "vitest"
import {
  linkDomain,
  previewMediaLayout,
  previewTabs,
  stepSlide,
} from "@/features/social-posts/lib/preview-media-layout"

test("facebook arranges 1, 2, 3 and 4 files and counts the overflow past four", () => {
  const kinds = [1, 2, 3, 4].map(
    (n) => previewMediaLayout("facebook", "image", n).kind,
  )
  expect(kinds).toEqual(["single", "pair", "triple", "grid"])
  expect(previewMediaLayout("facebook", "image", 4).overflowCount).toBe(0)
  expect(previewMediaLayout("facebook", "image", 7)).toEqual({
    kind: "grid",
    overflowCount: 3,
    visibleCount: 4,
  })
})

test("no files means no media block", () => {
  expect(previewMediaLayout("facebook", "text", 0).kind).toBe("none")
})

test("instagram uses a carousel for several files and a 9:16 frame for reels and stories", () => {
  expect(previewMediaLayout("instagram", "carousel", 3).kind).toBe("carousel")
  expect(previewMediaLayout("instagram", "image", 1).kind).toBe("single")
  expect(previewMediaLayout("instagram", "reel", 1).kind).toBe("vertical")
  expect(previewMediaLayout("instagram", "story", 1).kind).toBe("vertical")
})

test("threads scrolls a strip and tiktok shows one vertical frame", () => {
  expect(previewMediaLayout("threads", "image", 5)).toMatchObject({
    kind: "strip",
    visibleCount: 5,
  })
  expect(previewMediaLayout("tiktok", "video", 1).kind).toBe("vertical")
})

test("carousel steps wrap around", () => {
  expect(stepSlide(0, -1, 3)).toBe(2)
  expect(stepSlide(2, 1, 3)).toBe(0)
  expect(stepSlide(0, 1, 0)).toBe(0)
})

test("link domain drops www and rejects non-urls", () => {
  expect(linkDomain("https://www.example.com/a?b=1")).toBe("example.com")
  expect(linkDomain("not a url")).toBeNull()
})

test("two pages of the same network get distinct tab labels", () => {
  const destinations = new Map([
    ["a", { avatar: null, name: "Shop One", provider: "facebook" as const }],
    ["b", { avatar: "x.png", name: "Shop Two", provider: "facebook" as const }],
  ])
  const tabs = previewTabs(
    [
      { destinationId: "a", provider: "facebook" },
      { destinationId: "b", provider: "facebook" },
    ],
    destinations,
    () => "Facebook",
  )
  expect(tabs.map((tab) => tab.label)).toEqual(["Shop One", "Shop Two"])
  expect(new Set(tabs.map((tab) => tab.destinationId)).size).toBe(2)
})

test("a missing destination falls back to the network name", () => {
  const [tab] = previewTabs(
    [{ destinationId: "z", provider: "tiktok" }],
    new Map(),
    () => "TikTok",
  )
  expect(tab?.label).toBe("TikTok")
})
