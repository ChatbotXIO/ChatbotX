import { describe, expect, test } from "vitest"
import { findLatestMessageIdByAuthor } from "../find-latest-message-id-by-author"

const at = (minute: number) => new Date(Date.UTC(2026, 10, 20, 10, minute))

type Row = Parameters<typeof findLatestMessageIdByAuthor>[0][number]
const typed = (id: string, userId: string | null, minute: number): Row => ({
  id,
  createdAt: at(minute),
  messageType: "outgoing",
  senderType: "user",
  senderId: userId,
  contentAttributes: {},
  deletedAt: null,
})
const flow = (id: string, userId: string, minute: number): Row => ({
  ...typed(id, null, minute),
  senderType: "bot",
  contentAttributes: { sentByUserId: userId },
})

describe("findLatestMessageIdByAuthor", () => {
  test("picks each member's latest outgoing message", () => {
    const map = findLatestMessageIdByAuthor([
      typed("m1", "a", 1),
      typed("m2", "b", 2),
      typed("m3", "a", 3),
    ])

    expect(Object.fromEntries(map)).toEqual({ a: "m3", b: "m2" })
  })

  test("gives the same answer whatever the order of the loaded messages", () => {
    const rows = [typed("m1", "a", 1), typed("m2", "a", 2), typed("m3", "b", 3)]

    expect(findLatestMessageIdByAuthor([...rows].reverse())).toEqual(
      findLatestMessageIdByAuthor(rows),
    )
  })

  test("a flow or template row stamped with the member is theirs", () => {
    const map = findLatestMessageIdByAuthor([
      typed("m1", "a", 1),
      flow("m2", "a", 2),
    ])

    expect(map.get("a")).toBe("m2")
  })

  test("ignores customer, bot, API and unattributed rows", () => {
    const map = findLatestMessageIdByAuthor([
      {
        ...typed("m1", "a", 1),
        messageType: "incoming",
        senderType: "contact",
      },
      { ...typed("m2", null, 2), senderType: "bot" },
      { ...typed("m3", null, 3), senderType: "api" },
      typed("m4", null, 4),
    ])

    expect(map.size).toBe(0)
  })

  test("a deleted message does not carry the marker", () => {
    const map = findLatestMessageIdByAuthor([
      typed("m1", "a", 1),
      { ...typed("m2", "a", 2), deletedAt: at(3) },
    ])

    expect(map.get("a")).toBe("m1")
  })

  test("a tie on time resolves to the larger id on any order", () => {
    const rows = [typed("m1", "a", 5), typed("m2", "a", 5)]

    expect(findLatestMessageIdByAuthor(rows).get("a")).toBe("m2")
    expect(findLatestMessageIdByAuthor([...rows].reverse()).get("a")).toBe("m2")
  })

  test("a realtime message whose createdAt is an ISO string is ordered like a Date", () => {
    const wire = {
      ...typed("m2", "a", 0),
      createdAt: at(5).toISOString(),
    } as unknown as Row

    expect(
      findLatestMessageIdByAuthor([typed("m1", "a", 1), wire]).get("a"),
    ).toBe("m2")
    expect(
      findLatestMessageIdByAuthor([wire, typed("m3", "a", 9)]).get("a"),
    ).toBe("m3")
  })

  test("no messages, no markers", () => {
    expect(findLatestMessageIdByAuthor([]).size).toBe(0)
  })
})
