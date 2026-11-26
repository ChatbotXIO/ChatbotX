// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, test, vi } from "vitest"
import { PostAuthorCell } from "@/features/channel-posts/components/post-author-label"
import { POST_GRID } from "@/features/channel-posts/components/post-row"
import { COMPOSED_POST_GRID } from "@/features/social-posts/components/composed-posts-table"

const LAST_COLUMN_REM = /_(\d+(?:\.\d+)?)rem\]/

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

let root: Root | undefined
let container: HTMLDivElement | undefined

const render = (post: Parameters<typeof PostAuthorCell>[0]["post"]) => {
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(<PostAuthorCell post={post} />)
  })
  return container
}

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = undefined
  container = undefined
})

describe("PostAuthorCell", () => {
  test("a creator shows only the name, truncated, with no icon, tag or native title", () => {
    const view = render({
      authorExternalId: "x1",
      authorName: "An Nguyen",
      channel: "messenger",
      inboxName: "Shop Page",
    } as never)

    const name = view.querySelector(".truncate")
    expect(name?.textContent).toBe("An Nguyen")
    expect(view.querySelector("svg")).toBeNull()
    expect(view.querySelector("[title]")).toBeNull()
    expect(view.textContent).not.toContain("posts.detail.owner")
  })

  test("a post with no author shows the owner page's name with its tag under it", () => {
    const view = render({
      authorExternalId: null,
      authorName: null,
      channel: "messenger",
      inboxName: "Shop Page",
    } as never)

    const column = view.firstElementChild
    expect(column?.className).toContain("flex-col")
    const [name, tag] = Array.from(column?.children ?? [])
    expect(name?.textContent).toBe("Shop Page")
    expect(tag?.textContent).toBe("posts.detail.ownerPage")
  })
})

describe("table grids", () => {
  test("the channel table keeps its fixed columns at 27.5rem and lets the author column share the rest", () => {
    expect(POST_GRID).toContain(
      "[minmax(0,2fr)_11rem_minmax(10rem,1fr)_6.5rem]",
    )
  })

  test("the composed table has its own grid, and its actions column fits four 28 px buttons", () => {
    expect(COMPOSED_POST_GRID).not.toBe(POST_GRID)
    const actions = COMPOSED_POST_GRID.match(LAST_COLUMN_REM)
    const rem = Number(actions?.[1])
    // 4 buttons of 1.75rem + 3 gaps of 0.25rem + 1rem of padding.
    expect(rem).toBeGreaterThanOrEqual(4 * 1.75 + 3 * 0.25 + 1)
  })
})
