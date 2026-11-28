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
  contactTags: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    tagsAPI: { privateListWorkspaceTagOptionsAPI: mocks.listTags },
    contactsAPIs: {
      getContactAuthenticatedAPI: mocks.getContact,
      listContactTagsAuthenticatedAPI: mocks.contactTags,
    },
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
const { composerTagOptionsKey } = await import(
  "@/features/messages/lib/composer-tag-cache"
)
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
  let appliedIds: string[]

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
    appliedIds = []
    // The server answers `applied` per tag of the page for the asked contact.
    mocks.listTags.mockImplementation(async () => ({
      data: [tag("t1", "alpha", "#000000"), tag("t2", "beta")].map((item) => ({
        ...item,
        applied: appliedIds.includes(item.id),
      })),
      pageCount: 1,
    }))
    mocks.getContact.mockResolvedValue({ id: "c1", tags: [] })
    mocks.addAction.mockImplementation(
      async (_workspaceId: string, input: { tagId: string }) => ({
        data: {
          contactId: "c1",
          tagId: input.tagId,
          tag: { id: input.tagId, name: `tag-${input.tagId}`, color: null },
        },
      }),
    )
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
    appliedIds = ["t1"]
    await render()

    expect(chip("alpha")?.getAttribute("aria-pressed")).toBe("true")
    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("false")
    // Applied: full color; unapplied: the color at 40% alpha; text always white.
    expect(chip("alpha")?.style.backgroundColor).toBe("rgb(0, 0, 0)")
    expect(chip("alpha")?.style.color).toBe("rgb(255, 255, 255)")
    expect(chip("beta")?.style.backgroundColor).toBe("rgba(140, 140, 140, 0.4)")
    expect(chip("beta")?.style.color).toBe("rgb(255, 255, 255)")
  })

  test("lays the tags out as equal flex cells in a 1px-gap container with no background, with a dot on applied ones", async () => {
    appliedIds = ["t1"]
    await render()

    const row = chip("alpha")?.parentElement
    const grid = row?.parentElement
    expect(grid?.className).not.toContain("bg-[")
    expect(grid?.className).not.toContain("pt-0.5")
    expect(grid?.className).toContain("gap-px")
    expect(row?.className).toContain("gap-px")
    expect(chip("alpha")?.className).toContain("flex-1")
    expect(chip("alpha")?.className).toContain("basis-0")
    expect(chip("alpha")?.className).toContain("min-w-0")
    expect(chip("alpha")?.className).toContain("leading-[20px]")
    expect(chip("alpha")?.className).toContain("enabled:hover:opacity-70")
    expect(chip("alpha")?.className).toContain("rounded-[2px]")
    expect(chip("alpha")?.className).toContain("text-[10px]")
    expect(chip("alpha")?.className).toContain("font-normal")
    expect(chip("alpha")?.querySelector("[data-applied-dot]")).not.toBeNull()
    expect(chip("alpha")?.className).toContain("truncate")
    expect(chip("beta")?.querySelector("[data-applied-dot]")).toBeNull()
  })

  test("the remainder row comes first, then full rows", async () => {
    const width = vi
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(264)
    mocks.listTags.mockResolvedValue({
      data: ["a", "b", "c", "d", "e", "f", "g"].map((name) => tag(name, name)),
      pageCount: 1,
    })
    await render()

    // 264px fits 3 columns: 7 tags -> 1, 3, 3.
    const grid = chip("a")?.parentElement?.parentElement
    const rowSizes = Array.from(grid?.children ?? []).map(
      (row) => row.querySelectorAll("button").length,
    )
    expect(rowSizes).toEqual([1, 3, 3])
    width.mockRestore()
  })

  test("focusing a chip clipped by the collapsed height expands the grid", async () => {
    await render()
    const target = chip("beta")
    if (!target) {
      throw new Error("beta should render")
    }
    Object.defineProperty(target, "offsetTop", { value: 500 })
    Object.defineProperty(target, "offsetHeight", { value: 28 })
    await act(async () => target.focus())

    const toggle = container.querySelector("[aria-expanded]")
    expect(toggle?.getAttribute("aria-expanded")).toBe("true")
  })

  test("the collapsed grid is three 20px rows with 1px gaps", async () => {
    await render()

    expect(chip("alpha")?.parentElement?.parentElement?.style.maxHeight).toBe(
      "62px",
    )
  })

  test("a nearly white tag gets a subtle inset outline", async () => {
    mocks.listTags.mockResolvedValue({
      data: [tag("t1", "snow", "#FFFFFF"), tag("t2", "ink", "#000000")],
      pageCount: 1,
    })
    await render()

    expect(chip("snow")?.className).toContain("ring-black/10")
    expect(chip("ink")?.className).not.toContain("ring-black/10")
  })

  test("a focus ring on an edge cell is drawn inside it", async () => {
    await render()

    expect(chip("alpha")?.className).toContain("ring-inset")
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

  const contactKey = () =>
    orpc.contactsAPIs.getContactAuthenticatedAPI.queryOptions({
      input: { workspaceId: "w1", contactId: "c1" },
    }).queryKey

  test("a successful click patches the cached pages and contact in place, with no refetch", async () => {
    await render()
    // The contact panel's read, already in the cache.
    await queryClient.fetchQuery(
      orpc.contactsAPIs.getContactAuthenticatedAPI.queryOptions({
        input: { workspaceId: "w1", contactId: "c1" },
      }),
    )
    const contactReadsBefore = mocks.getContact.mock.calls.length
    const listReadsBefore = mocks.listTags.mock.calls.length

    await click("beta")

    expect(mocks.addAction).toHaveBeenCalledWith("w1", {
      contactId: "c1",
      tagId: "t2",
    })
    expect(mocks.getContact.mock.calls.length).toBe(contactReadsBefore)
    // Every list page counts contacts per tag: a success must not refetch them.
    expect(mocks.listTags.mock.calls.length).toBe(listReadsBefore)
    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("true")
    expect(
      queryClient.getQueryData<{ tags: { id: string }[] }>(contactKey())?.tags,
    ).toEqual([expect.objectContaining({ id: "t2", name: "tag-t2" })])

    await click("beta")
    expect(mocks.getContact.mock.calls.length).toBe(contactReadsBefore)
    expect(
      queryClient.getQueryData<{ tags: unknown[] }>(contactKey())?.tags,
    ).toEqual([])
    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("false")
  })

  const contactTagsKey = () =>
    orpc.contactsAPIs.listContactTagsAuthenticatedAPI.queryOptions({
      input: { workspaceId: "w1", contactId: "c1" },
    }).queryKey

  test("a successful click also patches the Tags editor's own list in place", async () => {
    await render()
    queryClient.setQueryData(contactTagsKey(), { data: [] })

    await click("beta")
    expect(
      queryClient.getQueryData<{ data: { id: string }[] }>(contactTagsKey())
        ?.data,
    ).toEqual([expect.objectContaining({ id: "t2" })])

    await click("beta")
    expect(
      queryClient.getQueryData<{ data: unknown[] }>(contactTagsKey())?.data,
    ).toEqual([])
  })

  test("a read begun before the click is superseded by a fresh read after it", async () => {
    await render()
    queryClient.setQueryData(contactTagsKey(), { data: [] })
    let resolveStale: (value: { data: unknown[] }) => void = () => undefined
    mocks.contactTags.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveStale = resolve
        }),
    )
    const stale = queryClient.fetchQuery({
      ...orpc.contactsAPIs.listContactTagsAuthenticatedAPI.queryOptions({
        input: { workspaceId: "w1", contactId: "c1" },
      }),
      staleTime: 0,
    })
    stale.catch(() => undefined)
    // The server has the click by the time the fresh read happens.
    mocks.contactTags.mockResolvedValue({
      data: [{ id: "t2", name: "tag-t2" }],
    })

    await click("beta")
    // The read captured the pre-toggle (empty) state and lands after the settle.
    resolveStale({ data: [] })
    await flush()

    expect(
      queryClient.getQueryData<{ data: { id: string }[] }>(contactTagsKey())
        ?.data,
    ).toEqual([expect.objectContaining({ id: "t2" })])
  })

  test("an add the server skipped (tag deleted meanwhile) re-reads instead of showing the tag applied", async () => {
    await render()
    await queryClient.fetchQuery(
      orpc.contactsAPIs.getContactAuthenticatedAPI.queryOptions({
        input: { workspaceId: "w1", contactId: "c1" },
      }),
    )
    queryClient.setQueryData(contactTagsKey(), { data: [] })
    mocks.addAction.mockResolvedValue({
      data: {
        contactId: "c1",
        tagId: "t2",
        tag: { id: "t2", name: "tag-t2", color: null },
        attached: false,
      },
    })
    const listReadsBefore = mocks.listTags.mock.calls.length

    await click("beta")

    expect(mocks.listTags.mock.calls.length).toBeGreaterThan(listReadsBefore)
    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("false")
    expect(
      queryClient.getQueryData<{ tags: unknown[] }>(contactKey())?.tags,
    ).toEqual([])
    expect(
      queryClient.getQueryData<{ data: unknown[] }>(contactTagsKey())?.data,
    ).toEqual([])
    expect(queryClient.getQueryState(contactTagsKey())?.isInvalidated).toBe(
      true,
    )
  })

  test("an add that returns no tag object cannot patch the contact, so it re-reads the options", async () => {
    await render()
    await queryClient.fetchQuery(
      orpc.contactsAPIs.getContactAuthenticatedAPI.queryOptions({
        input: { workspaceId: "w1", contactId: "c1" },
      }),
    )
    mocks.addAction.mockResolvedValue({
      data: { contactId: "c1", tagId: "t2", attached: true },
    })
    const listReadsBefore = mocks.listTags.mock.calls.length

    await click("beta")

    expect(mocks.listTags.mock.calls.length).toBeGreaterThan(listReadsBefore)
    expect(
      queryClient.getQueryData<{ tags: unknown[] }>(contactKey())?.tags,
    ).toEqual([])
  })

  test("asks for the options with the contact id, and the key carries it", async () => {
    await render()

    expect(mocks.listTags).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w1", contactId: "c1" }),
      expect.anything(),
    )
  })

  test("a click on an applied tag removes it", async () => {
    appliedIds = ["t1"]
    await render()

    appliedIds = []
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
    appliedIds = ["t1"]
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
    appliedIds = []
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: composerTagOptionsKey("w1", "c1"),
      })
    })
    await flush()

    // Remote removal is visible; the in-flight click still shows its intent.
    expect(chip("alpha")?.getAttribute("aria-pressed")).toBe("false")
    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("true")

    appliedIds = ["t2"]
    await act(async () => finishAdd())
    await flush()
    expect(chip("beta")?.getAttribute("aria-pressed")).toBe("true")
  })

  test("a realtime refresh after the click shows what other agents changed, without rolling back", async () => {
    await render()
    await click("beta")
    // Another agent also added alpha; the realtime event refreshes the options.
    appliedIds = ["t2", "t1"]
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: composerTagOptionsKey("w1", "c1"),
      })
    })
    await flush()

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
  ])("an options read answered %s (no access to the contact) disables the grid", async (code) => {
    mocks.listTags.mockRejectedValue(new ORPCError(code))
    await render()

    expect(container.textContent).toContain("disabledNoAccess")
    expect(container.textContent).not.toContain("loadError")
    expect(chip("alpha")).toBeNull()
  })

  test("the grid never reads the contact", async () => {
    appliedIds = ["t1"]
    await render()

    expect(mocks.getContact).not.toHaveBeenCalled()
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

  test("the search box is hidden while every tag fits the collapsed rows", async () => {
    await render()

    expect(container.querySelector("input[type=search]")).toBeNull()
  })

  test("the search box shows when more pages exist", async () => {
    mocks.listTags.mockResolvedValueOnce({
      data: [tag("t1", "alpha")],
      pageCount: 2,
    })
    await render()

    expect(container.querySelector("input[type=search]")).not.toBeNull()
  })

  test("search sends the text as the tag name filter and restarts at page 1", async () => {
    mocks.listTags.mockResolvedValueOnce({
      data: [tag("t1", "alpha")],
      pageCount: 2,
    })
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
    mocks.listTags.mockResolvedValueOnce({
      data: [tag("t1", "alpha")],
      pageCount: 2,
    })
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
