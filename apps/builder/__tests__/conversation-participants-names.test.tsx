// @vitest-environment jsdom

/** E1-E6: the participants header for 0/1/3/4 people, paging, and odd names. */

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { summarizeParticipantNames } from "@/features/conversations/lib/participant-names"
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

type P = {
  userId: string
  name: string | null
  image: string | null
  lastRepliedAt: Date
}
const person = (
  index: number,
  name: string | null = `Name${index} Family`,
): P => ({
  userId: `u${index}`,
  name,
  image: null,
  lastRepliedAt: new Date(`2026-11-${10 + index}T10:00:00Z`),
})
const people = (count: number) =>
  Array.from({ length: count }, (_, i) => person(i + 1))

describe("summarizeParticipantNames", () => {
  test.each([
    [0, false, 0, null],
    [1, false, 1, null],
    [3, false, 3, null],
    [4, false, 3, "1"],
    [103, false, 3, "100"],
    [4, true, 3, "1+"],
    [103, true, 3, "100+"],
    // E6: nothing hidden but the server has more: no count, the template's "+" alone.
    [3, true, 3, ""],
    [1, true, 1, ""],
  ])("loaded %i, hasMore %s -> shown %i, label %j", (loaded, hasMore, shown, label) => {
    expect(summarizeParticipantNames(loaded, hasMore)).toEqual({
      shownCount: shown,
      overflowLabel: label,
    })
  })
})

describe("ConversationParticipants header", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    query.hasNextPage = false
    query.data = undefined
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const renderRow = async (
    loaded: P[] | undefined,
    hasNextPage = false,
    recent: P[] = [],
  ) => {
    query.data = loaded ? { pages: [{ data: loaded }] } : undefined
    query.hasNextPage = hasNextPage
    const conversation = {
      id: "c1",
      recentParticipants: recent,
    } as unknown as ListConversationItemResource
    await act(() => {
      root.render(<ConversationParticipants conversation={conversation} />)
    })
    return container.textContent ?? ""
  }

  test("E1: nobody has replied -> nothing rendered", async () => {
    await renderRow([])
    expect(container.innerHTML).toBe("")
    await renderRow(undefined)
    expect(container.innerHTML).toBe("")
  })

  test.each([
    [1, "Name1 joined", false],
    [3, "Name1, Name2, Name3 joined", false],
    [4, "Name1, Name2, Name3 joined[+1]", true],
  ])("E2-E4: %i participants", async (count, expected, hasOverflow) => {
    const text = await renderRow(people(count))

    expect(text).toContain(expected)
    expect(text.includes("[+")).toBe(hasOverflow)
    expect(text).not.toContain("Name4")
  })

  test("E5: N loaded with a next page -> +N+", async () => {
    expect(await renderRow(people(7), true)).toContain(
      "Name1, Name2, Name3 joined[+4+]",
    )
  })

  test("while loading, the row's preview stands in and has no overflow", async () => {
    const text = await renderRow(undefined, false, people(2))

    expect(text).toContain("Name1, Name2 joined")
  })

  // E6: with nothing hidden yet, "more is coming" renders a single "+", not "++".
  test("E6: <=3 loaded with a next page renders one '+' and never '++'", async () => {
    const text = await renderRow(people(3), true)

    expect(text).toContain("Name1, Name2, Name3 joined[+]")
    expect(text).not.toContain("++")
  })

  test("names: given name is the first word, extra whitespace ignored", async () => {
    const text = await renderRow([
      person(1, "  Anna   Maria Lee "),
      person(2, "Cher"),
      person(3, "Jean\tLuc"),
    ])

    expect(text).toContain("Anna, Cher, Jean joined")
  })

  test("names: a null name falls back to the unnamed-member label", async () => {
    const text = await renderRow([person(1, null), person(2), person(3)])

    expect(text).toContain("unnamedMember, Name2, Name3 joined")
  })

  // An empty or whitespace-only member name reads as the unnamed-member label
  // like a null name does (header and dialog list).
  test.each([
    [""],
    ["   "],
  ])("name %j falls back to the unnamed-member label", async (name) => {
    const text = await renderRow([person(1, name), person(2)])

    expect(text).toContain("unnamedMember, Name2 joined")
  })

  test("names: an emoji / combining-mark given name stays whole", async () => {
    const text = await renderRow([
      person(1, "Zoe\u0301 Smith"),
      person(2, "😀 Smile"),
    ])

    expect(text).toContain("Zoe\u0301, 😀 joined")
  })
})
