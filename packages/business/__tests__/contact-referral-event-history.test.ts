import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listAdTouchesByContact: vi.fn(),
  findByIdOrFail: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: { marker: "db" } }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactReferralEventRepository: {
    listAdTouchesByContact: mocks.listAdTouchesByContact,
  },
}))
vi.mock("../src/contact/service", () => ({
  contactService: { findByIdOrFail: mocks.findByIdOrFail },
}))

import { listContactAdTouches } from "../src/contact-referral-event/contact-history"

describe("listContactAdTouches", () => {
  const touch = (id: string, occurredAt: string) => ({
    id,
    occurredAt: new Date(occurredAt),
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("checks the contact is reachable by the caller before reading its touches", async () => {
    mocks.listAdTouchesByContact.mockResolvedValueOnce([])
    const accessScope = { restrictToAssignedUserId: "user-1" }

    await listContactAdTouches({
      workspaceId: "1",
      contactId: "2",
      limit: 20,
      accessScope,
    })

    expect(mocks.findByIdOrFail).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "1", id: "2", accessScope }),
    )
  })

  test("does not read the touches of a contact the caller cannot open", async () => {
    mocks.findByIdOrFail.mockRejectedValueOnce(new Error("not found"))

    await expect(
      listContactAdTouches({
        workspaceId: "1",
        contactId: "2",
        limit: 20,
      }),
    ).rejects.toThrow("not found")
    expect(mocks.listAdTouchesByContact).not.toHaveBeenCalled()
  })

  test("returns the page and a cursor when another page exists", async () => {
    mocks.listAdTouchesByContact.mockResolvedValueOnce([
      touch("9", "2026-10-03T00:00:00Z"),
      touch("8", "2026-10-02T00:00:00Z"),
      touch("7", "2026-10-01T00:00:00Z"),
    ])

    const result = await listContactAdTouches({
      workspaceId: "1",
      contactId: "2",
      limit: 2,
    })

    expect(result.data.map((item) => item.id)).toEqual(["9", "8"])
    expect(result.nextCursor).toEqual({
      occurredAt: new Date("2026-10-02T00:00:00Z"),
      id: "8",
    })
  })

  test("has no cursor on the last page", async () => {
    mocks.listAdTouchesByContact.mockResolvedValueOnce([
      touch("9", "2026-10-03T00:00:00Z"),
    ])

    const result = await listContactAdTouches({
      workspaceId: "1",
      contactId: "2",
      limit: 2,
    })

    expect(result.data).toHaveLength(1)
    expect(result.nextCursor).toBeNull()
  })
})
