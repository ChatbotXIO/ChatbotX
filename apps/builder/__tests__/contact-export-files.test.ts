import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ listFiles: vi.fn() }))

vi.mock("@chatbotx.io/business", () => ({
  contactExportService: { listFiles: mocks.listFiles },
  contactService: {},
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: vi.fn(),
}))

const { exportFileOwnerFilter } = await import(
  "../src/features/contacts/permissions"
)
const { listContactExportFiles } = await import(
  "../src/features/contacts/lib/list-contact-export-files"
)
const { decodeCursor, encodeCursor } = await import("../src/lib/pagination")
const { contactExportFileCursor } = await import(
  "../src/features/contacts/schema/export-file"
)

beforeEach(() => {
  vi.clearAllMocks()
})

describe("exportFileOwnerFilter", () => {
  const user = { id: "u-1" }
  const noPermissions = {
    superAdmin: false,
    analytics: false,
    flows: false,
    contacts: false,
    onlyAssignedContacts: false,
    emailAndPhone: false,
    broadcast: false,
    ecommerce: false,
  }

  test("the workspace owner sees every member's exports", () => {
    expect(
      exportFileOwnerFilter({
        user,
        workspaceMember: { role: "owner", permissions: noPermissions },
      }),
    ).toBeUndefined()
  })

  test("an agent with the superAdmin permission sees every member's exports", () => {
    expect(
      exportFileOwnerFilter({
        user,
        workspaceMember: {
          role: "agent",
          permissions: { ...noPermissions, superAdmin: true },
        },
      }),
    ).toBeUndefined()
  })

  test("a plain agent sees only their own exports", () => {
    expect(
      exportFileOwnerFilter({
        user,
        workspaceMember: {
          role: "agent",
          permissions: { ...noPermissions, contacts: true },
        },
      }),
    ).toBe("u-1")
  })
})

describe("listContactExportFiles", () => {
  // Microseconds, as Postgres renders the column: a Date would drop them.
  const createdAt = "2026-10-20T10:00:00.123456Z"

  test("passes the owner filter and turns the next page into an opaque cursor", async () => {
    mocks.listFiles.mockResolvedValueOnce({
      data: [],
      nextCursor: { createdAt, id: "42" },
    })

    const result = await listContactExportFiles({
      workspaceId: "ws-1",
      userId: "u-1",
      perPage: 20,
    })

    expect(mocks.listFiles).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userId: "u-1",
      limit: 20,
      cursor: undefined,
    })
    expect(
      decodeCursor(result.nextCursor ?? "", contactExportFileCursor),
    ).toEqual({ createdAt, id: "42" })
  })

  test("reads a cursor back into the service's (createdAt, id) keyset", async () => {
    mocks.listFiles.mockResolvedValueOnce({ data: [], nextCursor: null })

    await listContactExportFiles({
      workspaceId: "ws-1",
      perPage: 20,
      cursor: encodeCursor({ createdAt, id: "42" }),
    })

    expect(mocks.listFiles).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { createdAt, id: "42" } }),
    )
  })

  test("rejects a corrupt cursor instead of silently restarting at page 1", async () => {
    await expect(
      listContactExportFiles({
        workspaceId: "ws-1",
        perPage: 20,
        cursor: "not-a-cursor",
      }),
    ).rejects.toMatchObject({ code: "invalidCursor", httpStatusCode: 400 })
    expect(mocks.listFiles).not.toHaveBeenCalled()
  })

  test.each([
    ["a createdAt that is not a timestamp", { createdAt: "'; drop", id: "42" }],
    [
      "a date that does not exist",
      { createdAt: "2026-02-30T10:00:00.000000Z", id: "42" },
    ],
    [
      "year zero, which Postgres has no timestamp for",
      { createdAt: "0000-01-01T00:00:00.000000Z", id: "42" },
    ],
    ["an id past the bigint range", { createdAt, id: "9223372036854775808" }],
  ])("rejects a cursor with %s before it reaches the query", async (_, cursor) => {
    await expect(
      listContactExportFiles({
        workspaceId: "ws-1",
        perPage: 20,
        cursor: encodeCursor(cursor),
      }),
    ).rejects.toMatchObject({ code: "invalidCursor" })
    expect(mocks.listFiles).not.toHaveBeenCalled()
  })
})
