// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { act, createContext, type ReactNode, useContext } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { AnalyticsSectionSelect } from "@/features/analytics/components/analytics-section-select"
import type { AnalyticsSectionOption } from "@/features/analytics/lib/analytics-sections"

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  filters: {
    current: { channels: [] as string[], inboxIds: [] as string[] },
  },
  pathname: { current: "/space/ws-1/dashboard/ads/messenger" },
  translate: {
    current: (key: string): string => key,
  },
}))

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname.current,
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock("nuqs", () => ({
  useQueryStates: () => [mocks.filters.current, vi.fn()],
}))
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => mocks.translate.current(key),
}))

// The real select is a popup; what matters is the contract: items and the
// current value in, the picked value out. `SelectValue` renders the selected
// item's label like the real one, so the trigger text is observable.
type SelectItems = { value: string; label: string }[]
const SelectContext = createContext<{
  items: SelectItems
  value: string | null
}>({ items: [], value: null })

vi.mock("@chatbotx.io/ui/components/ui/select", () => ({
  Select: ({
    children,
    items,
    value,
    onValueChange,
  }: {
    children: ReactNode
    items: SelectItems
    value: string | null
    onValueChange: (value: string | null) => void
  }) => (
    <SelectContext.Provider value={{ items, value }}>
      <div data-select-value={value ?? ""}>
        {children}
        <button
          data-pick-posts
          onClick={() => onValueChange("posts")}
          type="button"
        />
        <button
          data-pick-current
          onClick={() => onValueChange(value)}
          type="button"
        />
      </div>
    </SelectContext.Provider>
  ),
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <div data-item={value}>{children}</div>
  ),
  SelectTrigger: ({
    children,
    className,
  }: {
    children: ReactNode
    className?: string
  }) => (
    <div className={className} data-trigger>
      {children}
    </div>
  ),
  SelectValue: () => {
    const { items, value } = useContext(SelectContext)
    return <span data-value>{items.find((i) => i.value === value)?.label}</span>
  },
}))

const SECTIONS: AnalyticsSectionOption[] = [
  { id: "contacts", segment: "contacts" },
  { id: "posts", segment: "posts" },
  { id: "ads-messenger", segment: "ads/messenger" },
]

describe("AnalyticsSectionSelect", () => {
  let container: HTMLDivElement
  let root: Root

  const render = async (
    sections: AnalyticsSectionOption[] = SECTIONS,
    canAppendUnlisted = true,
  ) => {
    await act(() => {
      root.render(
        <AnalyticsSectionSelect
          canAppendUnlisted={canAppendUnlisted}
          sections={sections}
        />,
      )
    })
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mocks.push.mockClear()
    mocks.filters.current = { channels: [], inboxIds: [] }
    mocks.pathname.current = "/space/ws-1/dashboard/ads/messenger"
    mocks.translate.current = (key) => key
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  test("lists the given sections in order with their translated labels", async () => {
    await render()

    const items = Array.from(container.querySelectorAll("[data-item]"))
    expect(items.map((item) => item.getAttribute("data-item"))).toEqual([
      "contacts",
      "posts",
      "ads-messenger",
    ])
    expect(items.map((item) => item.textContent)).toEqual([
      "analytics.contacts",
      "analytics.sections.posts",
      "ads.dashboardNav.messenger",
    ])
  })

  test("takes its value from the pathname", async () => {
    await render()

    expect(
      container
        .querySelector("[data-select-value]")
        ?.getAttribute("data-select-value"),
    ).toBe("ads-messenger")
  })

  test("a deep-linked section missing from the list is appended and selected for a super-admin", async () => {
    mocks.pathname.current = "/space/ws-1/dashboard/ads/instagram"
    await render()

    expect(
      Array.from(container.querySelectorAll("[data-item]")).map((item) =>
        item.getAttribute("data-item"),
      ),
    ).toEqual(["contacts", "posts", "ads-messenger", "ads-instagram"])

    expect(
      container
        .querySelector("[data-select-value]")
        ?.getAttribute("data-select-value"),
    ).toBe("ads-instagram")
  })

  test("a member who may not see the deep-linked section gets no appended row", async () => {
    mocks.pathname.current = "/space/ws-1/dashboard/ads/instagram"
    await render(SECTIONS, false)

    expect(
      Array.from(container.querySelectorAll("[data-item]")).map((item) =>
        item.getAttribute("data-item"),
      ),
    ).toEqual(["contacts", "posts", "ads-messenger"])
  })

  test("shows the current section's label in the trigger", async () => {
    mocks.translate.current = (key) => `T(${key})`
    await render()

    expect(container.querySelector("[data-value]")?.textContent).toBe(
      "T(ads.dashboardNav.messenger)",
    )
    expect(container.querySelector("[data-trigger]")?.className).toContain(
      "w-full",
    )
  })

  test("the longest label in every locale fits the column the select is given", async () => {
    const dir = join(process.cwd(), "messages")
    const locales = readdirSync(dir).filter((file) => file.endsWith(".json"))
    expect(locales.length).toBe(21)
    const lookup = (messages: Record<string, unknown>, key: string): string =>
      String(
        key
          .split(".")
          .reduce<unknown>(
            (node, part) => (node as Record<string, unknown>)[part],
            messages,
          ),
      )
    // The row gives the select `sm:w-80` (20rem); about 8px per character plus
    // 48px for padding and the chevron is a generous bound at text-sm.
    const columnPx = 320
    const pxPerChar = 8
    const chromePx = 48

    for (const locale of locales) {
      const messages = JSON.parse(
        readFileSync(join(dir, locale), "utf8"),
      ) as Record<string, unknown>
      mocks.translate.current = (key) => lookup(messages, key)
      await render(
        [
          { id: "ads-messenger", segment: "ads/messenger" },
          { id: "contacts", segment: "contacts" },
        ],
        true,
      )
      const shown = container.querySelector("[data-value]")?.textContent ?? ""
      const longest = Math.max(
        ...Array.from(container.querySelectorAll("[data-item]")).map(
          (item) => item.textContent?.length ?? 0,
        ),
      )

      expect(shown.length, locale).toBeGreaterThan(0)
      expect(longest * pxPerChar + chromePx, locale).toBeLessThanOrEqual(
        columnPx,
      )
    }
  })

  test("picking another section carries only the shared channel and inbox selection", async () => {
    mocks.filters.current = { channels: ["messenger"], inboxIds: ["7", "9"] }
    await render()

    await act(() => {
      ;(
        container.querySelector("[data-pick-posts]") as HTMLButtonElement
      ).click()
    })

    expect(mocks.push).toHaveBeenCalledWith(
      "/space/ws-1/dashboard/posts?channels=messenger&inboxIds=7,9",
    )
  })

  test("renders nothing outside a section page", async () => {
    mocks.pathname.current = "/space/ws-1/dashboard/ads/conversion-events"
    await render()

    expect(container.innerHTML).toBe("")
  })

  test("picking another section without a selection navigates to its bare page", async () => {
    await render()

    await act(() => {
      ;(
        container.querySelector("[data-pick-posts]") as HTMLButtonElement
      ).click()
    })

    expect(mocks.push).toHaveBeenCalledWith("/space/ws-1/dashboard/posts")
  })

  test("picking the current section does not navigate", async () => {
    await render()

    await act(() => {
      ;(
        container.querySelector("[data-pick-current]") as HTMLButtonElement
      ).click()
    })

    expect(mocks.push).not.toHaveBeenCalled()
  })
})
