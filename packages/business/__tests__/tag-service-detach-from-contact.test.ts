// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// tagService.detachFromContact (packages/business/src/tag/service.ts) used to
// swallow emitTagRemoved failures with an empty `.catch(() => {})` — O3 in
// the PR review replaced that with a logged warning so a failed event emit
// isn't silently invisible.

const mockDeleteBuilder = {
  where: vi.fn(),
  returning: vi.fn(),
}
mockDeleteBuilder.where.mockReturnValue(mockDeleteBuilder)

const state = {
  findOrFailError: null as Error | null,
}

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    delete: vi.fn(() => mockDeleteBuilder),
  },
  findOrFail: vi.fn(() => {
    if (state.findOrFailError) {
      return Promise.reject(state.findOrFailError)
    }
    return Promise.resolve({})
  }),
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: {
    id: "contactModel.id",
    workspaceId: "contactModel.workspaceId",
  },
  contactsToTagsModel: {
    contactId: "contactsToTagsModel.contactId",
    tagId: "contactsToTagsModel.tagId",
  },
}))

const emitTagRemoved = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/events", () => ({
  emitTagRemoved,
  emitTagApplied: vi.fn(async () => undefined),
}))

const loggerWarn = vi.fn()
vi.mock("../src/logger", () => ({
  logger: { warn: loggerWarn, error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

vi.mock("../src/folder/service", () => ({
  folderService: {},
}))

vi.mock("../src/tag/sync.service", () => ({
  tagSyncService: { enqueueAttach: vi.fn(), enqueueDetach: vi.fn() },
}))

vi.mock("../src/ads-conversion/service", () => ({
  adsConversionService: {
    enqueueTagAppliedEvaluationsBulk: vi.fn(),
    enqueueTagAppliedEvaluationsForInbox: vi.fn(),
    isEligibleChannel: vi.fn(() => false),
  },
}))

vi.mock("../src/contact", () => ({
  contactService: {
    findByIdOrFail: vi.fn(),
    findManyByIds: vi.fn(),
    invalidate: vi.fn(async () => undefined),
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: async (_key: string, callback: () => Promise<unknown>) =>
    await callback(),
}))

const { tagService } = await import("../src/tag/service")

beforeEach(() => {
  vi.clearAllMocks()
  state.findOrFailError = null
  mockDeleteBuilder.where.mockReturnValue(mockDeleteBuilder)
})

describe("tagService.detachFromContact", () => {
  test("logs a warning (does not throw) when emitTagRemoved fails", async () => {
    mockDeleteBuilder.returning.mockResolvedValue([{ tagId: "tag-1" }])
    emitTagRemoved.mockRejectedValueOnce(new Error("event bus down"))

    await expect(
      tagService.detachFromContact({
        workspaceId: "ws-1",
        contactId: "c-1",
        tagIds: ["tag-1"],
      }),
    ).resolves.toBeUndefined()

    // Let the fire-and-forget .catch() microtask run.
    await Promise.resolve()
    await Promise.resolve()

    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "c-1",
        tagId: "tag-1",
      }),
      "Failed to emit tagRemoved event",
    )
  })

  test("does not warn when emitTagRemoved succeeds", async () => {
    mockDeleteBuilder.returning.mockResolvedValue([{ tagId: "tag-1" }])
    emitTagRemoved.mockResolvedValueOnce(undefined)

    await tagService.detachFromContact({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagIds: ["tag-1"],
    })
    await Promise.resolve()

    expect(loggerWarn).not.toHaveBeenCalled()
  })

  test("throws before deleting when the contact is out of scope", async () => {
    state.findOrFailError = new Error("Contact not found")

    await expect(
      tagService.detachFromContact({
        workspaceId: "ws-1",
        contactId: "c-missing",
        tagIds: ["tag-1"],
      }),
    ).rejects.toThrow("Contact not found")

    expect(mockDeleteBuilder.returning).not.toHaveBeenCalled()
  })
})
