import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type {
  ConversationParticipantResource,
  ListConversationItemResource,
} from "@/features/conversations/schema/resource"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join("|")}` : key,
  useFormatter: () => ({
    dateTime: (at: Date) => at.toISOString().slice(0, 16),
    list: (items: string[]) => items.join(", "),
  }),
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("@/lib/auth/avatar", () => ({ useUserAvatarUrl: () => undefined }))

const queryState = {
  data: undefined as
    | { pages: { data: ConversationParticipantResource[] }[] }
    | undefined,
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  isError: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
}
vi.mock("@/features/conversations/hooks/use-conversation-participants", () => ({
  useConversationParticipants: () => queryState,
}))

const { ConversationParticipants } = await import(
  "@/features/conversations/components/conversation-participants"
)

const member = (
  userId: string,
  name: string | null,
  day: number,
): ConversationParticipantResource => ({
  userId,
  name,
  image: null,
  lastRepliedAt: new Date(Date.UTC(2026, 10, day, 17, 0)),
})

const conversation = (
  recentParticipants: ConversationParticipantResource[],
): ListConversationItemResource =>
  ({
    id: "conv-1",
    recentParticipants,
  }) as unknown as ListConversationItemResource

describe("ConversationParticipants", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    Object.assign(queryState, {
      data: undefined,
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      isError: false,
    })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.innerHTML = ""
  })

  const render = (item: ListConversationItemResource) =>
    act(() => {
      root.render(<ConversationParticipants conversation={item} />)
    })
  const openDialog = () =>
    act(() => {
      container.querySelector("button")?.click()
    })

  test("renders nothing while nobody has replied", async () => {
    await render(conversation([]))

    expect(container.innerHTML).toBe("")
  })

  test("while the list loads, the row preview names who joined and the latest time", async () => {
    await render(
      conversation([member("1", "Hoàng", 20), member("2", "Hùng", 19)]),
    )

    expect(container.textContent).toContain("joined:Hoàng, Hùng")
    expect(container.textContent).toContain("2026-11-20T17:00")
  })

  test("the loaded list wins over the preview, newest reply first", async () => {
    queryState.data = {
      pages: [
        {
          data: [
            member("1", "Hoàng", 20),
            member("2", "Hùng", 19),
            member("3", "Tàu", 18),
          ],
        },
      ],
    }
    await render(conversation([member("1", "Hoàng", 20)]))

    expect(container.textContent).toContain("joined:Hoàng, Hùng, Tàu")
  })

  test("the dialog lists each member with their own reply time", async () => {
    queryState.data = {
      pages: [{ data: [member("1", "Hoàng", 20), member("2", "Hùng", 19)] }],
    }
    await render(conversation([]))
    await openDialog()

    const rows = Array.from(
      document.body.querySelectorAll("li > span:last-child"),
    ).map((span) => span.textContent)
    expect(rows).toEqual([
      "replied:Hoàng|2026-11-20T17:00",
      "replied:Hùng|2026-11-19T17:00",
    ])
  })

  test("clicking the header opens a titled dialog, not a popover", async () => {
    queryState.data = {
      pages: [{ data: [member("1", "Hoàng", 20)] }],
    }
    await render(conversation([]))
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()

    await openDialog()

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain("label")
    expect(dialog?.className.split(" ")).toContain("grid-cols-[minmax(0,1fr)]")
  })

  test("when the first load failed, the dialog says the list is only a preview and offers a retry", async () => {
    queryState.isError = true
    await render(conversation([member("1", "Hoàng", 20)]))
    await openDialog()

    const alert = document.body.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain("messages.errorLoadingData")
    const retry = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "actions.retry",
    )
    expect(retry).toBeDefined()
    act(() => retry?.click())
    expect(queryState.refetch).toHaveBeenCalledTimes(1)
  })

  test("no error row while the list loaded or while it is still loading", async () => {
    queryState.data = { pages: [{ data: [member("1", "Hoàng", 20)] }] }
    queryState.isError = true
    await render(conversation([]))
    await openDialog()

    expect(document.body.querySelector('[role="alert"]')).toBeNull()
  })

  test("a member without a name falls back to a label", async () => {
    queryState.data = { pages: [{ data: [member("1", null, 20)] }] }
    await render(conversation([]))

    expect(container.textContent).toContain("joined:unnamedMember")
  })

  test("offers Show more only when another page exists, and loads it", async () => {
    queryState.data = { pages: [{ data: [member("1", "Hoàng", 20)] }] }
    queryState.hasNextPage = true
    await render(conversation([]))
    await openDialog()

    const showMore = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "showMore",
    )
    expect(showMore).toBeDefined()
    act(() => {
      showMore?.click()
    })
    expect(queryState.fetchNextPage).toHaveBeenCalledOnce()
  })

  test("no Show more on the last page, and a failed page load says so", async () => {
    queryState.data = { pages: [{ data: [member("1", "Hoàng", 20)] }] }
    queryState.isFetchNextPageError = true
    await render(conversation([]))
    await openDialog()

    expect(document.body.textContent).not.toContain("showMore")
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
      "loadMoreFailed",
    )
  })

  test("keeps the preview when the full list failed to load", async () => {
    await render(conversation([member("1", "Hoàng", 20)]))

    expect(container.textContent).toContain("joined:Hoàng")
  })
})
