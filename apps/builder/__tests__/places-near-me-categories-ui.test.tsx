import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import messages from "../messages/en.json"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock(
  "../src/features/places-near-me/actions/create-place-category.action",
  () => ({ createPlaceCategoryAction: { bind: () => vi.fn() } }),
)
vi.mock(
  "../src/features/places-near-me/actions/update-place-category.action",
  () => ({ updatePlaceCategoryAction: { bind: () => vi.fn() } }),
)
vi.mock(
  "../src/features/places-near-me/actions/delete-place-category.action",
  () => ({ deletePlaceCategoryAction: { bind: () => vi.fn() } }),
)

const { CategoriesTable } = await import(
  "../src/features/places-near-me/components/categories-table"
)

const now = new Date("2026-01-01T00:00:00Z")
const categories = [
  {
    id: "1",
    name: "Stores",
    rank: 1,
    locationCount: 3,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "2",
    name: "Warehouses",
    rank: 10,
    locationCount: 0,
    createdAt: now,
    updatedAt: now,
  },
]

describe("places near me categories tab", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.innerHTML = ""
  })

  const render = (children: ReactNode) =>
    act(() => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <NextIntlClientProvider
            locale="en"
            messages={messages}
            timeZone="UTC"
          >
            {children}
          </NextIntlClientProvider>
        </QueryClientProvider>,
      )
    })

  const openMenuFor = (rowIndex: number, label: string) => {
    const triggers = container.querySelectorAll("button")
    const menuButtons = Array.from(triggers).filter((b) =>
      b.textContent?.includes("Open menu"),
    )
    act(() => {
      menuButtons[rowIndex]?.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true }),
      )
      menuButtons[rowIndex]?.click()
    })
    const item = Array.from(
      document.body.querySelectorAll('[role="menuitem"]'),
    ).find((el) => el.textContent?.includes(label))
    act(() => {
      ;(item as HTMLElement | undefined)?.click()
    })
  }

  test("renders a row per category with rank and location count", () => {
    render(<CategoriesTable categories={categories} workspaceId="9" />)
    const rows = container.querySelectorAll("tbody tr")
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain("Stores")
    expect(rows[0]?.textContent).toContain("3")
    expect(rows[1]?.textContent).toContain("Warehouses")
    expect(container.textContent).toContain("Add category")
  })

  test("Edit opens the form pre-filled with the name", () => {
    render(<CategoriesTable categories={categories} workspaceId="9" />)
    openMenuFor(0, "Edit")
    const input =
      document.body.querySelector<HTMLInputElement>('input[name="name"]')
    expect(input?.value).toBe("Stores")
  })

  test("Delete shows the uncategorized description for 3 locations", () => {
    render(<CategoriesTable categories={categories} workspaceId="9" />)
    openMenuFor(0, "Delete")
    expect(document.body.textContent).toContain("Delete Stores?")
    expect(document.body.textContent).toContain(
      "3 locations will become uncategorized.",
    )
  })
})
