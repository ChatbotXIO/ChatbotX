// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ listReplied: vi.fn() }))

vi.mock("@chatbotx.io/business", () => ({
  conversationParticipantService: { listReplied: mocks.listReplied },
}))

const { listConversationParticipants } = await import(
  "../src/features/conversations/queries/list-participants.query"
)

const row = (userId: string, minute: number) => ({
  userId,
  lastRepliedAt: new Date(Date.UTC(2026, 10, 20, 10, minute)),
  user: { id: userId, name: userId, image: null },
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listReplied.mockResolvedValue([])
})

describe("listConversationParticipants", () => {
  test("an empty conversation is an empty last page", async () => {
    await expect(
      listConversationParticipants({
        workspaceId: "ws-1",
        conversationId: "9",
      }),
    ).resolves.toEqual({ data: [], nextCursor: null })
  })

  test("asks for one extra row and returns a cursor only when more remain", async () => {
    mocks.listReplied.mockResolvedValue([
      row("1", 30),
      row("2", 20),
      row("3", 10),
    ])

    const page = await listConversationParticipants({
      workspaceId: "ws-1",
      conversationId: "9",
      perPage: 2,
    })

    expect(mocks.listReplied).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        conversationId: "9",
        limit: 3,
      }),
    )
    expect(page.data.map((p) => p.userId)).toEqual(["1", "2"])
    expect(page.nextCursor).toEqual(expect.any(String))
  })

  test("the next page resumes after the last member of the previous page", async () => {
    mocks.listReplied.mockResolvedValue([
      row("1", 30),
      row("2", 20),
      row("3", 10),
    ])
    const first = await listConversationParticipants({
      workspaceId: "ws-1",
      conversationId: "9",
      perPage: 2,
    })

    mocks.listReplied.mockResolvedValue([row("3", 10)])
    const second = await listConversationParticipants({
      workspaceId: "ws-1",
      conversationId: "9",
      perPage: 2,
      cursor: first.nextCursor ?? undefined,
    })

    expect(mocks.listReplied.mock.calls[1]?.[0].cursor).toEqual({
      lastRepliedAt: row("2", 20).lastRepliedAt,
      userId: "2",
    })
    expect(second).toMatchObject({ nextCursor: null })
    expect(second.data.map((p) => p.userId)).toEqual(["3"])
  })

  const encode = (cursor: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(cursor)).toString("base64")

  test.each([
    ["a garbage cursor", "not-a-cursor"],
    [
      "a cursor without a member id",
      encode({ lastRepliedAt: "2026-11-20T10:00:00.000Z" }),
    ],
    [
      "a member id past the bigint range",
      encode({
        lastRepliedAt: "2026-11-20T10:00:00.000Z",
        userId: "9223372036854775808",
      }),
    ],
    [
      "a time before year 1",
      encode({ lastRepliedAt: "-010000-01-01T00:00:00.000Z", userId: "2" }),
    ],
    [
      "a time past year 9999",
      encode({ lastRepliedAt: "+010000-01-01T00:00:00.000Z", userId: "2" }),
    ],
  ])("%s is a 400, not a silent restart or a SQL failure", async (_label, cursor) => {
    await expect(
      listConversationParticipants({
        workspaceId: "ws-1",
        conversationId: "9",
        cursor,
      }),
    ).rejects.toMatchObject({ code: "invalidCursor", httpStatusCode: 400 })
    expect(mocks.listReplied).not.toHaveBeenCalled()
  })

  test("defaults to 50 per page and never exceeds 100", async () => {
    await listConversationParticipants({
      workspaceId: "ws-1",
      conversationId: "9",
    })
    await listConversationParticipants({
      workspaceId: "ws-1",
      conversationId: "9",
      perPage: 5000,
    })

    expect(mocks.listReplied.mock.calls[0]?.[0].limit).toBe(51)
    expect(mocks.listReplied.mock.calls[1]?.[0].limit).toBe(101)
  })
})
