import { beforeEach, describe, expect, test, vi } from "vitest"

/**
 * B4/B5: the opaque cursor of the touchpoints feed. A malformed cursor is a
 * 400 `invalidCursor` and never reaches the repository; a well-formed one
 * carries only `(occurredAt, kind, resourceKey)` and can never widen the
 * workspace or contact the repository is asked about.
 */

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

const input = { workspaceId: "1", contactId: "2", perPage: 2 }
const goodAt = "2026-01-02T00:00:00.123456Z"
const b64 = (text: string) => Buffer.from(text).toString("base64url")
const cursorOf = (value: unknown) => b64(JSON.stringify(value))
const valid = { o: goodAt, k: "poll", r: "7" }

const row = (kind: string, key: string, at: string) => ({
  kind,
  resourceKey: key,
  resourceName: "n",
  occurredAt: new Date(at),
  occurredAtKey: at,
  channel: null,
  inboxId: null,
  details: { clicks: 1 },
})

describe("touchpoint cursor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByIdOrFail.mockResolvedValue({ id: "2" })
    mocks.listByContact.mockResolvedValue([])
  })

  test.each([
    ["bad base64 (symbols)", "!!!not-base64!!!"],
    ["base64 of plain text", b64("hello world")],
    [
      "base64 of truncated json",
      b64('{"o":"2026-01-02T00:00:00.000000Z","k":"po'),
    ],
    ["json null", cursorOf(null)],
    ["json array", cursorOf([valid])],
    ["json number", cursorOf(5)],
    ["json string", cursorOf("poll")],
    ["empty object", cursorOf({})],
    ["missing o", cursorOf({ k: "poll", r: "7" })],
    ["missing k", cursorOf({ o: goodAt, r: "7" })],
    ["missing r", cursorOf({ o: goodAt, k: "poll" })],
    ["o is a number", cursorOf({ ...valid, o: 1_700_000_000 })],
    ["k is a number", cursorOf({ ...valid, k: 3 })],
    ["r is a number", cursorOf({ ...valid, r: 7 })],
    ["o null", cursorOf({ ...valid, o: null })],
    ["unknown kind", cursorOf({ ...valid, k: "nope" })],
    ["kind in wrong case", cursorOf({ ...valid, k: "Poll" })],
    ["kind with sql", cursorOf({ ...valid, k: "poll'; DROP TABLE x;--" })],
    ["date only", cursorOf({ ...valid, o: "2026-01-02" })],
    ["no Z", cursorOf({ ...valid, o: "2026-01-02T00:00:00.123456" })],
    [
      "offset instead of Z",
      cursorOf({ ...valid, o: "2026-01-02T00:00:00.123456+00:00" }),
    ],
    ["lowercase z", cursorOf({ ...valid, o: "2026-01-02T00:00:00.123456z" })],
    [
      "seven fractional digits",
      cursorOf({ ...valid, o: "2026-01-02T00:00:00.1234567Z" }),
    ],
    ["month 13", cursorOf({ ...valid, o: "2026-13-02T00:00:00.123456Z" })],
    ["feb 30", cursorOf({ ...valid, o: "2026-02-30T00:00:00.123456Z" })],
    ["hour 24", cursorOf({ ...valid, o: "2026-01-02T24:00:00.123456Z" })],
    ["date with sql", cursorOf({ ...valid, o: "2026-01-02'; select 1;--" })],
    ["timestamp cast trick", cursorOf({ ...valid, o: "now()" })],
    ["key empty", cursorOf({ ...valid, r: "" })],
    ["key negative", cursorOf({ ...valid, r: "-1" })],
    ["key decimal", cursorOf({ ...valid, r: "1.5" })],
    ["key exponent", cursorOf({ ...valid, r: "1e3" })],
    ["key hex", cursorOf({ ...valid, r: "0x10" })],
    ["key spaces", cursorOf({ ...valid, r: " 7 " })],
    ["key letters", cursorOf({ ...valid, r: "abc" })],
    ["key sql", cursorOf({ ...valid, r: "7 OR 1=1" })],
    ["key sql comment", cursorOf({ ...valid, r: "7;--" })],
    [
      "key one above bigint max",
      cursorOf({ ...valid, r: "9223372036854775808" }),
    ],
    [
      "key far above bigint max",
      cursorOf({ ...valid, r: "99999999999999999999999" }),
    ],
    ["key 10k digits", cursorOf({ ...valid, r: "9".repeat(10_000) })],
    ["unicode digits", cursorOf({ ...valid, r: "٣" })],
  ])("rejects %s with invalidCursor 400 and reads nothing", async (_name, cursor) => {
    await expect(
      contactTouchpointService.list({ ...input, cursor }),
    ).rejects.toMatchObject({ code: "invalidCursor", httpStatusCode: 400 })
    expect(mocks.listByContact).not.toHaveBeenCalled()
  })

  test("a valid cursor is accepted, including the largest bigint and key 0", async () => {
    for (const r of ["0", "1", "9223372036854775807"]) {
      await contactTouchpointService.list({
        ...input,
        cursor: cursorOf({ ...valid, r }),
      })
    }

    expect(mocks.listByContact).toHaveBeenCalledTimes(3)
  })

  test("extra fields in the cursor are ignored and never forwarded", async () => {
    await contactTouchpointService.list({
      ...input,
      cursor: cursorOf({ ...valid, workspaceId: "999", contactId: "888" }),
    })

    const arg = mocks.listByContact.mock.calls[0]?.[0]
    expect(arg.cursor).toEqual({
      occurredAt: goodAt,
      kind: "poll",
      resourceKey: "7",
    })
    expect(arg.workspaceId).toBe("1")
    expect(arg.contactId).toBe("2")
  })

  test("a structurally valid cursor from another workspace or contact only seeds the position; scope comes from the caller", async () => {
    // Cursors carry no workspace or contact: a foreign key is just a position.
    await contactTouchpointService.list({
      ...input,
      cursor: cursorOf({ o: goodAt, k: "magicLink", r: "424242424242" }),
    })

    expect(mocks.findByIdOrFail).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "1", id: "2" }),
    )
    expect(mocks.listByContact.mock.calls[0]?.[0]).toMatchObject({
      workspaceId: "1",
      contactId: "2",
      cursor: { kind: "magicLink", resourceKey: "424242424242" },
    })
  })

  test("a cursor is never decoded before the contact is proven reachable", async () => {
    mocks.findByIdOrFail.mockRejectedValueOnce(new Error("Contact not found"))

    await expect(
      contactTouchpointService.list({ ...input, cursor: "garbage!!" }),
    ).rejects.toThrow("Contact not found")
  })

  test("the cursor the service returns decodes to exactly the last row of the page", async () => {
    mocks.listByContact.mockResolvedValueOnce([
      row("magicLink", "5", "2026-03-01T00:00:00.000001Z"),
      row("magicLink", "4", "2026-03-01T00:00:00.000000Z"),
      row("magicLink", "3", "2026-02-01T00:00:00.000000Z"),
    ])

    const { nextCursor, data } = await contactTouchpointService.list(input)

    expect(data.map((item) => item.resourceKey)).toEqual(["5", "4"])
    expect(
      JSON.parse(Buffer.from(nextCursor ?? "", "base64url").toString()),
    ).toEqual({ o: "2026-03-01T00:00:00.000000Z", k: "magicLink", r: "4" })
    mocks.listByContact.mockResolvedValueOnce([])
    await contactTouchpointService.list({ ...input, cursor: nextCursor ?? "" })
    expect(mocks.listByContact.mock.calls[1]?.[0].cursor).toEqual({
      occurredAt: "2026-03-01T00:00:00.000000Z",
      kind: "magicLink",
      resourceKey: "4",
    })
  })

  test("characterization: an empty-string cursor means no cursor (first page), not invalidCursor", async () => {
    await contactTouchpointService.list({ ...input, cursor: "" })

    expect(mocks.listByContact.mock.calls[0]?.[0].cursor).toBeUndefined()
  })
})
