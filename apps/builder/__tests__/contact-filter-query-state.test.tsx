// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ContactFilterCriteria } from "@/features/contact-filter/schema"

const { mockRouterReplace } = vi.hoisted(() => ({
  mockRouterReplace: vi.fn(),
}))

let searchParams = new URLSearchParams()

vi.mock("next/navigation", () => ({
  usePathname: () => "/space/workspace-1/contacts",
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => searchParams,
}))

const { useContactFilterQueryState } = await import(
  "@/features/contact-filter/components/use-contact-filter-query-state"
)

const validFilter: ContactFilterCriteria = {
  operator: "and",
  conditions: [
    {
      field: "inbox",
      operator: "eq",
      value: ["inbox-1"],
    },
  ],
}

function FilterProbe({ onRender }: { onRender: (count: number) => void }) {
  const { filter } = useContactFilterQueryState()
  onRender(filter.conditions.length)
  return <output>{filter.conditions.length}</output>
}

describe("useContactFilterQueryState", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    mockRouterReplace.mockReset()
    searchParams = new URLSearchParams()
    window.history.replaceState(
      { existing: true },
      "",
      "/space/workspace-1/contacts#contacts",
    )
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  test("consumes a valid URL filter and removes only that parameter without navigation", async () => {
    const filterJson = JSON.stringify(validFilter)
    searchParams = new URLSearchParams({
      contactFilter: filterJson,
      keyword: "Ada",
    })
    window.history.replaceState(
      { existing: true },
      "",
      `/space/workspace-1/contacts?${searchParams.toString()}#contacts`,
    )

    await act(async () => {
      root.render(<FilterProbe onRender={() => undefined} />)
      await Promise.resolve()
    })

    expect(container.textContent).toBe("1")
    expect(window.location.href).toContain("?keyword=Ada#contacts")
    expect(window.history.state).toEqual({ existing: true })
    expect(mockRouterReplace).not.toHaveBeenCalled()
  })

  test("leaves an invalid URL filter untouched", async () => {
    searchParams = new URLSearchParams({ contactFilter: "{invalid" })
    window.history.replaceState(
      { existing: true },
      "",
      "/space/workspace-1/contacts?contactFilter=%7Binvalid#contacts",
    )

    await act(async () => {
      root.render(<FilterProbe onRender={() => undefined} />)
      await Promise.resolve()
    })

    expect(container.textContent).toBe("0")
    expect(window.location.href).toContain("contactFilter=%7Binvalid#contacts")
    expect(mockRouterReplace).not.toHaveBeenCalled()
  })
})
