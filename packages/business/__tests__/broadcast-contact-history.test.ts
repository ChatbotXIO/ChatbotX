import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listForContact: vi.fn(),
  findByIdOrFail: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: { marker: "db" } }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  broadcastRepository: { listForContact: mocks.listForContact },
}))
vi.mock("../src/contact/service", () => ({
  contactService: { findByIdOrFail: mocks.findByIdOrFail },
}))

import { listContactBroadcasts } from "../src/broadcast/contact-history"

describe("listContactBroadcasts", () => {
  const row = (broadcastId: string, schedulesAt: string) => ({
    broadcastId,
    schedulesAt: new Date(schedulesAt),
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("checks the contact is reachable by the caller before reading its broadcasts", async () => {
    mocks.listForContact.mockResolvedValueOnce([])
    const accessScope = { restrictToAssignedUserId: "user-1" }

    await listContactBroadcasts({
      workspaceId: "1",
      contactId: "2",
      limit: 20,
      accessScope,
    })

    expect(mocks.findByIdOrFail).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "1", id: "2", accessScope }),
    )
  })

  test("does not read the broadcasts of a contact the caller cannot open", async () => {
    mocks.findByIdOrFail.mockRejectedValueOnce(new Error("not found"))

    await expect(
      listContactBroadcasts({ workspaceId: "1", contactId: "2", limit: 20 }),
    ).rejects.toThrow("not found")
    expect(mocks.listForContact).not.toHaveBeenCalled()
  })

  test("returns the page and a cursor when another page exists", async () => {
    mocks.listForContact.mockResolvedValueOnce([
      row("9", "2026-10-03T00:00:00Z"),
      row("8", "2026-10-02T00:00:00Z"),
      row("7", "2026-10-01T00:00:00Z"),
    ])

    const result = await listContactBroadcasts({
      workspaceId: "1",
      contactId: "2",
      limit: 2,
    })

    expect(result.data.map((item) => item.broadcastId)).toEqual(["9", "8"])
    expect(result.nextCursor).toEqual({
      schedulesAt: new Date("2026-10-02T00:00:00Z"),
      broadcastId: "8",
    })
  })

  test("has no cursor on the last page", async () => {
    mocks.listForContact.mockResolvedValueOnce([
      row("9", "2026-10-03T00:00:00Z"),
    ])

    const result = await listContactBroadcasts({
      workspaceId: "1",
      contactId: "2",
      limit: 2,
    })

    expect(result.data).toHaveLength(1)
    expect(result.nextCursor).toBeNull()
  })

  test("has no cursor and no data for a contact that was never sent a broadcast", async () => {
    mocks.listForContact.mockResolvedValueOnce([])

    const result = await listContactBroadcasts({
      workspaceId: "1",
      contactId: "2",
      limit: 2,
    })

    expect(result).toEqual({ data: [], nextCursor: null })
  })
})
