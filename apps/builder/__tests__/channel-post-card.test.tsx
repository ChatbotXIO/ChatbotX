// @vitest-environment jsdom

import type { MessageChannelPostEntity } from "@chatbotx.io/sdk"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { ChannelPostCard } from "@/features/messages/components/channel-post-card"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const FULL_CAPTION = "First line of the caption\nSecond line that was cut off"
const SENT_TEXT = "First line of the caption…\nhttps://example.com/p/1"

const post = (
  shareMode: MessageChannelPostEntity["shareMode"],
  caption: string | null = FULL_CAPTION,
): MessageChannelPostEntity => ({
  type: "channel_post",
  shareMode,
  channelPostId: "cp1",
  externalPostId: "ext1",
  permalink: "https://example.com/p/1",
  thumbnail: null,
  caption,
})

let root: Root | undefined
let container: HTMLDivElement | undefined

const render = (element: React.ReactElement) => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(element)
  })
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe("ChannelPostCard", () => {
  test("a textLink share shows the text the customer received, not the full caption", () => {
    const view = render(
      <ChannelPostCard post={post("textLink")} sentText={SENT_TEXT} />,
    )

    expect(view.textContent).toContain(SENT_TEXT)
    expect(view.textContent).not.toContain("Second line")
    expect(view.querySelector(".whitespace-pre-line")).not.toBeNull()
  })

  test("a nativeMedia share keeps showing the caption", () => {
    const view = render(
      <ChannelPostCard post={post("nativeMedia")} sentText={SENT_TEXT} />,
    )

    expect(view.textContent).toContain("Second line")
    expect(view.textContent).not.toContain("…")
  })

  test("a textLink share with empty text falls back to the caption", () => {
    const view = render(
      <ChannelPostCard post={post("textLink")} sentText="  " />,
    )

    expect(view.textContent).toContain("Second line")
  })
})

describe("ChannelPostCard permalink", () => {
  const link = (permalink: string | null) => {
    const view = render(
      <ChannelPostCard post={{ ...post("nativeMedia"), permalink }} />,
    )
    return view.querySelector("a")
  }

  test("links an http(s) permalink", () => {
    expect(link("https://example.com/p/1")?.getAttribute("href")).toBe(
      "https://example.com/p/1",
    )
  })

  test("hides the link for a missing or non-http permalink", () => {
    expect(link(null)).toBeNull()
    act(() => root?.unmount())
    container?.remove()
    expect(link("javascript:alert(1)")).toBeNull()
  })
})
