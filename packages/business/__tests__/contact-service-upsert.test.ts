import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  contactFindFirst,
  findOrFail,
  invalidateCacheByTags,
  insertedRows,
  workspaceFind,
} = vi.hoisted(() => ({
  contactFindFirst: vi.fn(),
  findOrFail: vi.fn(),
  invalidateCacheByTags: vi.fn().mockResolvedValue(undefined),
  insertedRows: [] as Record<string, unknown>[],
  workspaceFind: vi.fn(),
}))

const makeInsert = () => ({
  values: (row: Record<string, unknown>) => {
    insertedRows.push(row)
    return {
      returning: () =>
        Promise.resolve([
          {
            id: "source" in row ? "ci-1" : "contact-1",
            contactId: "contact-1",
            createdAt: new Date("2026-06-01T00:00:00.000Z"),
            ...row,
          },
        ]),
    }
  },
})

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  db: {
    query: {
      contactModel: {
        findFirst: contactFindFirst,
      },
    },
  },
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
  findOrFail,
  inArray: (column: unknown, values: unknown[]) => ({
    __inArray: [column, values],
  }),
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags,
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
}))

vi.mock("@chatbotx.io/event-bus", () => ({
  emit: vi.fn(),
}))

vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@chatbotx.io/filesystem", () => ({
  uploadFileFromUrl: vi.fn(),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("@chatbotx.io/utils")>()

  return {
    ...original,
    createId: vi.fn(() => "generated-id"),
  }
})

vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: {
    createNewContactWithMac: vi.fn(
      async (args: {
        create: (tx: {
          insert: () => ReturnType<typeof makeInsert>
        }) => Promise<{
          value: unknown
        }>
      }) => ({
        ok: true,
        ...(await args.create({ insert: makeInsert })),
      }),
    ),
  },
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: {
    find: workspaceFind,
  },
}))

const { contactService } = await import("../src/contact/service")
const { contactSources } = await import("@chatbotx.io/database/partials")

describe("contactService.upsertByIdentifier", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    insertedRows.length = 0
    contactFindFirst.mockResolvedValue(null)
    findOrFail.mockResolvedValue({ id: "webchat-inbox", channel: "webchat" })
    workspaceFind.mockResolvedValue({ id: "ws-1", ownerId: "owner-1" })
  })

  test("writes the caller-provided source to new ContactInbox rows", async () => {
    await contactService.upsertByIdentifier({
      workspaceId: "ws-1",
      identifier: "email:ada@example.com",
      source: contactSources.enum.api,
      data: { firstName: "Ada" },
    })

    expect(insertedRows).toContainEqual(
      expect.objectContaining({
        channel: "webchat",
        source: "api",
      }),
    )
  })
})
