import { NextIntlClientProvider } from "next-intl"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
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
  "../src/features/places-near-me/actions/create-place-location.action",
  () => ({ createPlaceLocationAction: { bind: () => vi.fn() } }),
)
vi.mock(
  "../src/features/places-near-me/actions/update-place-location.action",
  () => ({ updatePlaceLocationAction: { bind: () => vi.fn() } }),
)
vi.mock(
  "../src/features/places-near-me/actions/delete-place-location.action",
  () => ({ deletePlaceLocationAction: { bind: () => vi.fn() } }),
)

const { LocationsTable } = await import(
  "../src/features/places-near-me/components/locations-table"
)

const now = new Date("2026-01-01T00:00:00Z")
const previewUrl =
  "https://www.google.com/maps/search/?api=1&query=16.0078%2C108.266"
const locations = {
  pageCount: 1,
  data: [
    {
      id: "1",
      name: "Da Nang Store",
      latitude: 16.0078,
      longitude: 108.266,
      categoryId: "5",
      categoryName: "Stores",
      previewUrl,
      createdAt: now,
      updatedAt: now,
    },
  ],
}
const categories = [
  {
    id: "5",
    name: "Stores",
    rank: 1,
    locationCount: 1,
    createdAt: now,
    updatedAt: now,
  },
]

describe("places near me locations tab", () => {
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

  const render = () =>
    act(() => {
      root.render(
        <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
          <NuqsTestingAdapter>
            <LocationsTable
              categories={categories}
              locations={locations}
              workspaceId="9"
            />
          </NuqsTestingAdapter>
        </NextIntlClientProvider>,
      )
    })

  const openEdit = () => {
    const nameButton = Array.from(
      container.querySelectorAll("tbody button"),
    ).find((b) => b.textContent?.includes("Da Nang Store")) as HTMLElement
    act(() => nameButton.click())
  }

  const paste = (input: HTMLInputElement, text: string) => {
    const event = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", {
      value: { getData: () => text },
    })
    act(() => {
      input.dispatchEvent(event)
    })
    return event
  }

  const dialogInput = (name: string) =>
    document.body.querySelector<HTMLInputElement>(`input[name="${name}"]`)

  const openAdd = () => {
    const add = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Add location"),
    ) as HTMLElement
    act(() => add.click())
  }

  test("renders name and coordinates", () => {
    render()
    const row = container.querySelector("tbody tr")
    expect(row?.textContent).toContain("Da Nang Store")
    expect(row?.textContent).toContain("16.0078, 108.266")
  })

  test("pasting a coordinate pair into latitude fills both inputs", () => {
    render()
    openAdd()
    const latitude = dialogInput("latitude") as HTMLInputElement
    const event = paste(latitude, "16.0078, 108.2660")
    expect(event.defaultPrevented).toBe(true)
    expect(dialogInput("latitude")?.value).toBe("16.0078")
    expect(dialogInput("longitude")?.value).toBe("108.266")
  })

  test("pasting a single number leaves longitude empty", () => {
    render()
    openAdd()
    const event = paste(dialogInput("latitude") as HTMLInputElement, "16.5")
    expect(event.defaultPrevented).toBe(false)
    expect(dialogInput("longitude")?.value).toBe("")
  })

  test("Preview link points at previewUrl in a new tab", () => {
    render()
    const trigger = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Open menu"),
    ) as HTMLElement
    act(() => {
      trigger.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }))
      trigger.click()
    })
    const link = Array.from(document.body.querySelectorAll("a")).find((a) =>
      a.textContent?.includes("Preview"),
    )
    expect(link?.getAttribute("href")).toBe(previewUrl)
    expect(link?.getAttribute("target")).toBe("_blank")
  })

  test("clicking the name opens the edit dialog pre-filled", () => {
    render()
    openEdit()
    expect(dialogInput("name")?.value).toBe("Da Nang Store")
    expect(dialogInput("latitude")?.value).toBe("16.0078")
    expect(dialogInput("longitude")?.value).toBe("108.266")
  })
})
