import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ListConversationItemResource } from "@/features/conversations/schema/resource"

vi.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string, values?: { names?: string; overflow?: string | number }) => {
      if (key === "overflowCount") {
        return `[+${values?.overflow}]`
      }
      if (key === "joinedShort") {
        return `${values?.names} joined`
      }
      return key
    },
  useFormatter: () => ({
    dateTime: (at: Date) => at.toISOString(),
    list: (items: string[]) => items.join(", "),
  }),
}))
vi.mock("@/hooks/routing", () => ({ useWorkspaceId: () => "ws-1" }))
vi.mock("@/features/conversations/components/participant-avatar", () => ({
  ParticipantAvatar: () => null,
}))

const query = {
  data: undefined as { pages: { data: unknown[] }[] } | undefined,
  hasNextPage: false,
  isError: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  fetchNextPage: vi.fn(),
  refetch: vi.fn(),
}
vi.mock("@/features/conversations/hooks/use-conversation-participants", () => ({
  useConversationParticipants: () => query,
}))

const { ConversationParticipants } = await import(
  "@/features/conversations/components/conversation-participants"
)

const participant = (index: number) => ({
  userId: `u${index}`,
  name: `Name${index} Family`,
  image: null,
  lastRepliedAt: new Date(`2026-11-${10 + index}T10:00:00Z`),
})

const conversation = {
  id: "conversation-1",
  recentParticipants: [],
} as unknown as ListConversationItemResource

describe("ConversationParticipants names and overflow", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    query.hasNextPage = false
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const renderWith = async (count: number, hasNextPage: boolean) => {
    query.data = {
      pages: [
        { data: Array.from({ length: count }, (_, i) => participant(i + 1)) },
      ],
    }
    query.hasNextPage = hasNextPage
    await act(() => {
      root.render(<ConversationParticipants conversation={conversation} />)
    })
    return container.textContent ?? ""
  }

  test("2 participants: both given names, no overflow", async () => {
    const text = await renderWith(2, false)

    expect(text).toContain("Name1, Name2 joined")
    expect(text).not.toContain("[+")
  })

  test("exactly 3 participants: three given names, no overflow", async () => {
    const text = await renderWith(3, false)

    expect(text).toContain("Name1, Name2, Name3 joined")
    expect(text).not.toContain("[+")
  })

  test("more than 3, no next page: three names then +N of the rest", async () => {
    const text = await renderWith(6, false)

    expect(text).toContain("Name1, Name2, Name3 joined[+3]")
    expect(text).not.toContain("Name4")
  })

  test("5 participants: three names then +2, outside the truncated names", async () => {
    const text = await renderWith(5, false)

    expect(text).toContain("Name1, Name2, Name3 joined[+2]")
    expect(text).not.toContain("Name4")
    const overflow = Array.from(container.querySelectorAll("span")).find(
      (element) => element.textContent === "[+2]",
    )
    expect(overflow?.className).toContain("shrink-0")
    expect(overflow?.closest(".truncate")).toBeNull()
  })

  test("more than 3 with a next page: the +N gets a trailing +", async () => {
    const text = await renderWith(6, true)

    expect(text).toContain("Name1, Name2, Name3 joined[+3+]")
  })
})
