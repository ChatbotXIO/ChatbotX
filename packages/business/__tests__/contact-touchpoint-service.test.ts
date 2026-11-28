import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listByContact: vi.fn(),
  findByIdOrFail: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({ db: { marker: "db" } }))
vi.mock("@chatbotx.io/database/repositories", () => ({
  contactTouchpointRepository: { listByContact: mocks.listByContact },
}))
vi.mock("../src/contact/service", () => ({
  contactService: { findByIdOrFail: mocks.findByIdOrFail },
}))

import { contactTouchpointService } from "../src/contact-touchpoint/service"

const row = (
  kind: string,
  resourceKey: string,
  occurredAtKey: string,
  details: Record<string, unknown>,
) => ({
  kind,
  resourceKey,
  resourceName: `${kind} ${resourceKey}`,
  occurredAt: new Date(occurredAtKey),
  occurredAtKey,
  channel: null,
  inboxId: null,
  details,
})

const input = { workspaceId: "1", contactId: "2", perPage: 2 }

const cursorOf = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url")

describe("contactTouchpointService.list", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByIdOrFail.mockResolvedValue({ id: "2" })
  })

  test("checks the contact is reachable by the caller before reading", async () => {
    mocks.listByContact.mockResolvedValueOnce([])
    const accessScope = { restrictToAssignedUserId: "user-1" }

    await contactTouchpointService.list({ ...input, accessScope })

    expect(mocks.findByIdOrFail).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "1", id: "2", accessScope }),
    )
  })

  test("does not read the feed of a contact in another workspace", async () => {
    mocks.findByIdOrFail.mockRejectedValueOnce(new Error("Contact not found"))

    await expect(contactTouchpointService.list(input)).rejects.toThrow(
      "Contact not found",
    )
    expect(mocks.listByContact).not.toHaveBeenCalled()
  })

  test("asks for one extra row and returns a cursor only when there is a next page", async () => {
    mocks.listByContact.mockResolvedValueOnce([
      row("magicLink", "9", "2026-01-03T00:00:00.000000Z", { clicks: 3 }),
      row("refLink", "8", "2026-01-02T00:00:00.000000Z", {
        linkType: "qrCode",
        visits: 1,
      }),
      row("poll", "7", "2026-01-01T00:00:00.000000Z", { candidateName: null }),
    ])

    const page = await contactTouchpointService.list(input)

    expect(mocks.listByContact.mock.calls[0]?.[0]).toMatchObject({ limit: 3 })
    expect(page.data.map((item) => item.kind)).toEqual(["magicLink", "refLink"])
    expect(page.nextCursor).not.toBeNull()
    const cursor = JSON.parse(
      Buffer.from(page.nextCursor ?? "", "base64url").toString("utf8"),
    )
    expect(cursor).toEqual({
      o: "2026-01-02T00:00:00.000000Z",
      k: "refLink",
      r: "8",
    })

    mocks.listByContact.mockResolvedValueOnce([])
    await contactTouchpointService.list({
      ...input,
      cursor: page.nextCursor ?? "",
    })
    expect(mocks.listByContact.mock.calls[1]?.[0].cursor).toEqual({
      occurredAt: "2026-01-02T00:00:00.000000Z",
      kind: "refLink",
      resourceKey: "8",
    })
  })

  test("accepts the largest bigint key", async () => {
    mocks.listByContact.mockResolvedValueOnce([])

    await contactTouchpointService.list({
      ...input,
      cursor: cursorOf({
        o: "2026-02-28T23:59:59.999999Z",
        k: "poll",
        r: "9223372036854775807",
      }),
    })

    expect(mocks.listByContact).toHaveBeenCalled()
  })

  test("returns no cursor on the last page", async () => {
    mocks.listByContact.mockResolvedValueOnce([
      row("magicLink", "9", "2026-01-03T00:00:00.000000Z", { clicks: 1 }),
    ])

    expect((await contactTouchpointService.list(input)).nextCursor).toBeNull()
  })

  test("passes the kinds filter through", async () => {
    mocks.listByContact.mockResolvedValueOnce([])

    await contactTouchpointService.list({ ...input, kinds: ["poll"] })

    expect(mocks.listByContact.mock.calls[0]?.[0]).toMatchObject({
      kinds: ["poll"],
    })
  })

  test.each([
    ["not base64 json", "%%%"],
    ["wrong shape", cursorOf({ o: "x" })],
    [
      "unknown kind",
      cursorOf({ o: "2026-01-02T00:00:00.000000Z", k: "nope", r: "1" }),
    ],
    [
      "millisecond-only timestamp",
      cursorOf({ o: "2026-01-02T00:00:00.000Z", k: "poll", r: "1" }),
    ],
    [
      "key above the bigint range",
      cursorOf({
        o: "2026-01-02T00:00:00.000000Z",
        k: "poll",
        r: "9223372036854775808",
      }),
    ],
    [
      "impossible date",
      cursorOf({ o: "2026-02-30T00:00:00.000000Z", k: "poll", r: "1" }),
    ],
    [
      "impossible time",
      cursorOf({ o: "2026-01-02T25:00:00.000000Z", k: "poll", r: "1" }),
    ],
    [
      "non-numeric key",
      cursorOf({ o: "2026-01-02T00:00:00.000000Z", k: "poll", r: "1; drop" }),
    ],
  ])("rejects an invalid cursor (%s) with invalidCursor (400)", async (_name, cursor) => {
    await expect(
      contactTouchpointService.list({ ...input, cursor }),
    ).rejects.toMatchObject({ code: "invalidCursor", httpStatusCode: 400 })
    expect(mocks.listByContact).not.toHaveBeenCalled()
  })

  test("fails loudly when a row's details do not match its kind", async () => {
    mocks.listByContact.mockResolvedValueOnce([
      row("magicLink", "9", "2026-01-03T00:00:00.000000Z", { clicks: "many" }),
    ])

    await expect(contactTouchpointService.list(input)).rejects.toThrow()
  })
})
