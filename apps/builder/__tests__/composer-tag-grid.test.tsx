// @vitest-environment jsdom

import { ORPCError } from "@orpc/client"
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { makeQueryClient } from "./query-test-utils"

const mocks = vi.hoisted(() => ({
  addAction: vi.fn(),
  removeAction: vi.fn(),
  listTags: vi.fn(),
  getContact: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    tagsAPI: { privateListWorkspaceTagsAPI: mocks.listTags },
    contactsAPIs: { getContactAuthenticatedAPI: mocks.getContact },
  },
}))
vi.mock("@/features/contacts/actions/add-contact-tag-by-id.action", () => ({
  addContactTagByIdAction: mocks.addAction,
}))
vi.mock("@/features/contacts/actions/remove-contact-tag-by-id.action", () => ({
  removeContactTagByIdAction: mocks.removeAction,
}))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError } }))
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}:${values.name}` : key,
}))
vi.mock("@/hooks/use-debounced-value", () => ({
  useDebouncedValue: <T,>(value: T) => value,
}))

const { orpc } = await import("@/lib/orpc/query")
const { ComposerTagGrid } = await import(
  "@/features/messages/components/composer-tag-grid"
)

const tag = (id: string, name: string, color: string | null = null) => ({
  id,
  name,
  color,
})

type Props = { contactId?: string | null; isContactBlocked?: boolean }

describe("ComposerTagGrid", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient
  let contactTags: { id: string }[]

  const flush = async () => {
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
    }
  }

  const render = async ({
    contactId = "c1",
    isContactBlocked = false,
  }: Props = {}) => {
    await act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ComposerTagGrid
            contactId={contactId}
            isContactBlocked={isContactBlocked}
            workspaceId="w1"
          />
        </QueryClientProvider>,
      )
    })
    await flush()
  }

  const chip = (name: string) =>
    container.querySelector<HTMLButtonElement>(`button[title="${name}"]`)
  const click = async (name: string) => {
    await act(() => {
      chip(name)?.click()
    })
    await flush()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    contactTags = []
    mocks.listTags.mockResolvedValue({
      data: [tag("t1", "alpha", "#000000"), tag("t2", "beta")],
      pageCount: 1,
    })
    mocks.getContact.mockImplementation(async () => ({
      id: "c1",
      tags: contactTags,
    }))
    mocks.addAction.mockResolvedValue({
      data: { contactId: "c1", tagId: "t" },
    })
    mocks.removeAction.mockResolvedValue({
      data: { contactId: "c1", tagId: "t" },
    })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    queryClient = makeQueryClient()
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  test("shows every tag with its color and marks the contact's tags", async () => {
    contactTags = [{ id: "t1" }]
    await render()

    expect(chip("alpha")?.getAttribute("aria-pressed")).toBe("true")
    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("false")
    expect(chip("alpha")?.style.backgroundColor).toBe("rgb(0, 0, 0)")
    expect(chip("alpha")?.style.color).toBe("rgb(255, 255, 255)")
  })

  test("shows a loading state before the tags arrive", async () => {
    mocks.listTags.mockReturnValue(new Promise(() => undefined))
    await render()

    expect(container.querySelector("[aria-busy]")).not.toBeNull()
  })

  test("shows the empty state when the workspace has no tags", async () => {
    mocks.listTags.mockResolvedValue({ data: [], pageCount: 1 })
    await render()

    expect(container.textContent).toContain("empty")
  })

  test("shows an error state with retry when the tags fail to load", async () => {
    mocks.listTags.mockRejectedValue(new Error("down"))
    await render()

    expect(container.textContent).toContain("loadError")
    mocks.listTags.mockResolvedValue({
      data: [tag("t1", "alpha")],
      pageCount: 1,
    })
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("retry"),
    )
    await act(async () => retry?.click())
    await flush()
    expect(chip("alpha")).not.toBeNull()
  })

  test("a successful click re-reads the contact but not the tag list", async () => {
    await render()
    const readsBefore = mocks.getContact.mock.calls.length
    const listReadsBefore = mocks.listTags.mock.calls.length

    contactTags = [{ id: "t2" }]
    await click("beta")

    expect(mocks.addAction).toHaveBeenCalledWith("w1", {
      contactId: "c1",
      tagId: "t2",
    })
    expect(mocks.getContact.mock.calls.length).toBeGreaterThan(readsBefore)
    // Every list page counts contacts per tag: a success must not refetch them.
    expect(mocks.listTags.mock.calls.length).toBe(listReadsBefore)
    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("true")
  })

  test("a click on an applied tag removes it", async () => {
    contactTags = [{ id: "t1" }]
    await render()

    contactTags = []
    await click("alpha")

    expect(mocks.removeAction).toHaveBeenCalledWith("w1", {
      contactId: "c1",
      tagId: "t1",
    })
    expect(chip("alpha")?.getAttribute("aria-pressed")).toBe("false")
  })

  test("overlapping add then remove on one tag sends one request at a time, the latest intent last", async () => {
    await render()
    let finishAdd: () => void = () => undefined
    mocks.addAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAdd = () =>
            resolve({
              data: { contactId: "c1", tagId: "t" },
            })
        }),
    )

    await act(async () => chip("beta")?.click())
    // The chip already shows the optimistic state; the second click removes.
    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("true")
    await act(async () => chip("beta")?.click())

    expect(mocks.addAction).toHaveBeenCalledTimes(1)
    expect(mocks.removeAction).not.toHaveBeenCalled()

    await act(async () => finishAdd())
    await flush()

    expect(mocks.removeAction).toHaveBeenCalledTimes(1)
    expect(mocks.removeAction).toHaveBeenCalledWith("w1", {
      contactId: "c1",
      tagId: "t2",
    })
    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("false")
  })

  test("a remote contact refresh mid-toggle keeps the pending state, and a remote removal shows once idle", async () => {
    contactTags = [{ id: "t1" }]
    await render()
    expect(chip("alpha")?.getAttribute("aria-pressed")).toBe("true")

    let finishAdd: () => void = () => undefined
    mocks.addAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishAdd = () => resolve({ data: { contactId: "c1", tagId: "t" } })
        }),
    )
    await act(async () => chip("beta")?.click())

    // Another agent removes alpha while beta's request is in flight; the
    // realtime handler invalidates the contact query.
    contactTags = []
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.contactsAPIs.getContactAuthenticatedAPI.queryOptions({
          input: { workspaceId: "w1", contactId: "c1" },
        }).queryKey,
      })
    })
    await flush()

    // Remote removal is visible; the in-flight click still shows its intent.
    expect(chip("alpha")?.getAttribute("aria-pressed")).toBe("false")
    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("true")

    contactTags = [{ id: "t2" }]
    await act(async () => finishAdd())
    await flush()
    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("true")
  })

  test("reconciles with the server after settle instead of rolling back from memory", async () => {
    await render()
    // Another agent also added alpha while this request was in flight.
    mocks.addAction.mockImplementation(() => {
      contactTags = [{ id: "t2" }, { id: "t1" }]
      return Promise.resolve({
        data: { contactId: "c1", tagId: "t" },
      })
    })

    await click("beta")

    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("true")
    expect(chip("alpha")?.getAttribute("aria-pressed")).toBe("true")
  })

  test("a failed request shows an error toast and falls back to the server state", async () => {
    await render()
    mocks.addAction.mockResolvedValue({ serverError: "nope" })

    await click("beta")

    expect(mocks.toastError).toHaveBeenCalledWith("addFailed:beta")
    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("false")
  })

  test("a tag deleted elsewhere fails with a toast and the tag list is re-read (it is never re-created)", async () => {
    await render()
    mocks.addAction.mockResolvedValue({ serverError: "Tag not found" })
    const listReadsBefore = mocks.listTags.mock.calls.length
    mocks.listTags.mockResolvedValue({
      data: [tag("t1", "alpha", "#000000")],
      pageCount: 1,
    })

    await click("beta")

    expect(mocks.toastError).toHaveBeenCalledWith("addFailed:beta")
    expect(mocks.listTags.mock.calls.length).toBeGreaterThan(listReadsBefore)
    expect(chip("beta")).toBeNull()
  })

  test.each([
    ["no contact", { contactId: null }, "disabledNoContact"],
    ["a blocked contact", { isContactBlocked: true }, "disabledBlocked"],
  ])("%s: chips are disabled with the reason, and nothing is sent", async (_label, props, reasonKey) => {
    await render(props)

    expect(chip("alpha")?.disabled).toBe(true)
    expect(container.textContent).toContain(reasonKey)
    await click("alpha")
    expect(mocks.addAction).not.toHaveBeenCalled()
  })

  test.each([
    "NOT_FOUND",
    "FORBIDDEN",
  ])("a contact read answered %s (no access) disables the grid", async (code) => {
    mocks.getContact.mockRejectedValue(new ORPCError(code))
    await render()

    expect(chip("alpha")?.disabled).toBe(true)
    expect(container.textContent).toContain("disabledNoAccess")
  })

  test("any other contact read failure is a load error with a retry, not a permission lock", async () => {
    mocks.getContact.mockRejectedValue(new Error("network down"))
    await render()

    expect(container.textContent).toContain("contactLoadError")
    expect(container.textContent).not.toContain("disabledNoAccess")
    expect(chip("alpha")?.disabled).toBe(true)

    mocks.getContact.mockResolvedValue({ id: "c1", tags: [] })
    const retry = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("retry"),
    )
    await act(async () => retry?.click())
    await flush()

    expect(container.textContent).not.toContain("contactLoadError")
    expect(chip("alpha")?.disabled).toBe(false)
  })

  test("a tag that appears on two pages is shown once", async () => {
    mocks.listTags
      .mockResolvedValueOnce({ data: [tag("t1", "alpha")], pageCount: 2 })
      .mockResolvedValueOnce({
        data: [tag("t1", "alpha"), tag("t2", "beta")],
        pageCount: 2,
      })
    await render()
    const toggle = container.querySelector<HTMLButtonElement>(
      "button[aria-expanded]",
    )
    await act(async () => toggle?.click())
    const loadMore = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("loadMore"),
    )
    await act(async () => loadMore?.click())
    await flush()

    expect(container.querySelectorAll('button[title="alpha"]')).toHaveLength(1)
    expect(chip("beta")).not.toBeNull()
  })

  test("search sends the text as the tag name filter and restarts at page 1", async () => {
    await render()
    const input =
      container.querySelector<HTMLInputElement>("input[type=search]")
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set
    await act(() => {
      setter?.call(input, "vip")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await flush()

    expect(mocks.listTags).toHaveBeenLastCalledWith(
      expect.objectContaining({
        workspaceId: "w1",
        page: 1,
        perPage: 50,
        name: "vip",
      }),
      expect.anything(),
    )
  })

  test("a no-match search says so", async () => {
    await render()
    mocks.listTags.mockResolvedValue({ data: [], pageCount: 1 })
    const input =
      container.querySelector<HTMLInputElement>("input[type=search]")
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set
    await act(() => {
      setter?.call(input, "zzz")
      input?.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await flush()

    expect(container.textContent).toContain("noMatch")
  })

  test("more pages load 50 at a time from the expanded grid", async () => {
    mocks.listTags
      .mockResolvedValueOnce({ data: [tag("t1", "alpha")], pageCount: 2 })
      .mockResolvedValueOnce({ data: [tag("t2", "beta")], pageCount: 2 })
    await render()
    expect(chip("beta")).toBeNull()

    const toggle = container.querySelector<HTMLButtonElement>(
      "button[aria-expanded]",
    )
    expect(toggle).not.toBeNull()
    await act(async () => toggle?.click())
    const loadMore = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("loadMore"),
    )
    await act(async () => loadMore?.click())
    await flush()

    expect(mocks.listTags).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2, perPage: 50 }),
      expect.anything(),
    )
    expect(chip("beta")).not.toBeNull()
  })
})
