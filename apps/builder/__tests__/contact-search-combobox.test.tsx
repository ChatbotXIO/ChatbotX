// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))
vi.mock("@/features/contacts/components/contact-avatar", () => ({
  ContactAvatar: () => null,
}))

const listContacts = vi.fn()
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    contactsAPIs: {
      listContactsByPOSTAuthenticatedAPI: {
        queryOptions: ({
          input,
          enabled,
        }: {
          input: { workspaceId: string; keyword?: string }
          enabled: boolean
        }) => ({
          queryKey: ["contacts", input.workspaceId, input.keyword ?? ""],
          queryFn: () => listContacts(input),
          enabled,
        }),
      },
    },
  },
}))

import { ContactSearchCombobox } from "@/features/contacts/components/contact-search-combobox"

const rows = [
  { id: "11", fullName: "Ann Lee", avatar: null, createdAt: null },
  { id: "12", fullName: " ", email: "bo@example.com", avatar: null },
  { id: "13", fullName: null, avatar: null },
]

let container: HTMLDivElement
let root: Root

const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

const render = async (onSelect = vi.fn()) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  await act(() => {
    root.render(
      <QueryClientProvider client={client}>
        <ContactSearchCombobox onSelect={onSelect} workspaceId="1" />
      </QueryClientProvider>,
    )
  })
  await flush()
  return onSelect
}

const input = () =>
  container.querySelector<HTMLInputElement>('[role="combobox"]')
const options = () => Array.from(container.querySelectorAll('[role="option"]'))
const press = async (key: string) => {
  await act(() => {
    input()?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
  })
}

describe("ContactSearchCombobox", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    listContacts.mockReset()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test("lists contacts with a display-name fallback to email, then id", async () => {
    listContacts.mockResolvedValue({ data: rows })
    await render()

    expect(options().map((option) => option.textContent)).toEqual([
      "Ann Lee",
      "bo@example.com",
      "13",
    ])
    expect(input()?.getAttribute("aria-expanded")).toBe("true")
  })

  test("arrow keys move the active option (wrapping) and Enter picks it", async () => {
    listContacts.mockResolvedValue({ data: rows })
    const onSelect = await render()

    await press("ArrowDown")
    await press("ArrowDown")
    expect(input()?.getAttribute("aria-activedescendant")).toBe(
      options()[1]?.id,
    )
    expect(options()[1]?.getAttribute("aria-selected")).toBe("true")

    await press("ArrowUp")
    await press("ArrowUp")
    expect(input()?.getAttribute("aria-activedescendant")).toBe(
      options()[2]?.id,
    )

    await press("Enter")
    expect(onSelect).toHaveBeenCalledWith({
      id: "13",
      name: "13",
      avatar: null,
      createdAt: null,
    })
  })

  test("Enter without an active option picks nothing", async () => {
    listContacts.mockResolvedValue({ data: rows })
    const onSelect = await render()

    await press("Enter")

    expect(onSelect).not.toHaveBeenCalled()
  })

  test("clicking an option picks it", async () => {
    listContacts.mockResolvedValue({ data: rows })
    const onSelect = await render()

    await act(() => {
      ;(options()[0] as HTMLElement).click()
    })

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "11", name: "Ann Lee" }),
    )
  })

  test("shows the empty state when nothing matches", async () => {
    listContacts.mockResolvedValue({ data: [] })
    await render()

    expect(container.textContent).toContain("contacts.search.empty")
    expect(input()?.getAttribute("aria-expanded")).toBe("false")
  })

  test("shows the error with a retry that searches again", async () => {
    listContacts.mockRejectedValueOnce(new Error("boom"))
    await render()
    expect(container.textContent).toContain("contacts.search.error")

    listContacts.mockResolvedValue({ data: rows })
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "actions.retry",
    )
    await act(() => {
      retry?.click()
    })
    await flush()

    expect(listContacts).toHaveBeenCalledTimes(2)
    expect(options()).toHaveLength(3)
  })
})
