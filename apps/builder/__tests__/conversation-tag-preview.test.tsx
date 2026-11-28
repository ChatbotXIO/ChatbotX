// @vitest-environment jsdom

/** D1: the conversation row's tag chips and the count-only "+N". */

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ConversationTagPreview } from "@/features/conversations/components/conversation-tag-preview"
import { ROW_TAG_PREVIEW_LIMIT } from "@/features/conversations/lib/tag-preview"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}))

const tag = (index: number, color: string | null = null) => ({
  id: String(index),
  name: `Tag ${index}`,
  color,
})

describe("ConversationTagPreview", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (
    contact: Parameters<typeof ConversationTagPreview>[0]["contact"],
  ) => act(() => root.render(<ConversationTagPreview contact={contact} />))
  const chips = () =>
    Array.from(container.querySelectorAll("[title]")).map((el) =>
      el.getAttribute("title"),
    )
  const more = () => container.querySelector("[aria-label]")

  test("the preview limit is three", () => {
    expect(ROW_TAG_PREVIEW_LIMIT).toBe(3)
  })

  test.each([
    [0, 0, null],
    [1, 1, null],
    [3, 3, null],
    [4, 3, "+1"],
    [103, 3, "+100"],
  ])("a contact with %i tags shows %i chips and %s", (total, shown, hiddenLabel) => {
    render({
      tagCount: total,
      tagPreview: Array.from({ length: Math.min(total, 3) }, (_, i) =>
        tag(i + 1),
      ),
    })

    expect(chips()).toEqual(
      Array.from({ length: shown }, (_, i) => `Tag ${i + 1}`),
    )
    if (hiddenLabel === null) {
      expect(more()).toBeNull()
    } else {
      expect(more()?.textContent).toBe(`more:${hiddenLabel.slice(1)}`)
      expect(more()?.getAttribute("aria-label")).toBe(
        `moreLabel:${hiddenLabel.slice(1)}`,
      )
    }
    if (total === 0) {
      expect(container.innerHTML).toBe("")
    }
  })

  test("a preview longer than the limit is cut to three and the rest counted", () => {
    render({
      tagCount: 6,
      tagPreview: Array.from({ length: 6 }, (_, i) => tag(i + 1)),
    })

    expect(chips()).toHaveLength(3)
    expect(more()?.textContent).toBe("more:3")
  })

  test("a count lower than the preview never shows a negative or zero +N", () => {
    render({ tagCount: 1, tagPreview: [tag(1), tag(2), tag(3)] })

    expect(chips()).toHaveLength(3)
    expect(more()).toBeNull()
  })

  test("a row from an older deploy (no preview fields) renders nothing", () => {
    render({})

    expect(container.innerHTML).toBe("")
  })

  test("only a count with an empty preview still shows +N", () => {
    render({ tagCount: 5, tagPreview: [] })

    expect(chips()).toEqual([])
    expect(more()?.textContent).toBe("more:5")
  })

  test("a chip with an invalid stored color uses the neutral pastel, a valid one its tint", () => {
    render({
      tagCount: 2,
      tagPreview: [tag(1, "red; background:url(x)"), tag(2, "#FF0000")],
    })

    const [bad, good] = Array.from(
      container.querySelectorAll<HTMLElement>("[title]"),
    )
    expect(bad.style.backgroundColor).toBe("rgb(243, 244, 246)")
    expect(good.style.backgroundColor).not.toBe("rgb(243, 244, 246)")
  })
})
