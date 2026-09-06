import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// The three conditional/flag writes lifted out of the worker flow-step
// handlers (`apps/worker/src/integration/handlers/contact.ts` and
// `contact/update-avatar.ts`) when direct `db.*` access was removed from
// `apps/worker`.
//
// Two of them fold their eligibility check into the UPDATE's own WHERE
// clause. Those `isNull(...)` predicates are TOCTOU guards, not cosmetics:
//
//   * `subscribeBroadcastIfUnsubscribed` must not overwrite an existing
//     `broadcastSubscribedAt`, or a re-run of the flow step would reset the
//     original subscription timestamp.
//   * `setAvatarIfEmpty` must not overwrite an avatar a concurrent profile
//     refresh already wrote.
//
// A read-then-write refactor would reintroduce both races, so the tests below
// assert the predicate is present in the WHERE and that no read precedes the
// write. `setFlowFlags` deliberately has NO conditional guard but DOES
// invalidate the contact cache (the raw worker write did not — a deliberate
// fix carried by the refactor).
//
// The schema module is stubbed with plain objects rather than
// `importOriginal`-ed: importing the real schema opens a database connection
// through the sharding client.
// ---------------------------------------------------------------------------

const { mockDbUpdate } = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn((...args: unknown[]) => ({ __and: args })),
  db: { update: mockDbUpdate },
  eq: vi.fn((left: unknown, right: unknown) => ({ __eq: [left, right] })),
  findOrFail: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn((column: unknown) => ({ __isNull: column })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: [[...strings], values],
  })),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactInboxModel: { id: "ci.id", contactId: "ci.contactId" },
  contactModel: {
    id: "contact.id",
    workspaceId: "contact.workspaceId",
    avatar: "contact.avatar",
    broadcastSubscribedAt: "contact.broadcastSubscribedAt",
    emailOptIn: "contact.emailOptIn",
    emailVerified: "contact.emailVerified",
  },
  conversationModel: { id: "conv.id", contactId: "conv.contactId" },
  inboxModel: { id: "inbox.id" },
}))

vi.mock("@chatbotx.io/database/queries", () => ({
  buildContactWhere: vi.fn(),
  contactFilterHasPredicate: vi.fn(),
}))

vi.mock("@chatbotx.io/event-bus", () => ({ emit: vi.fn() }))
vi.mock("@chatbotx.io/events", () => ({
  emitContactCreated: vi.fn(),
  emitContactInfoUpdated: vi.fn(),
}))
vi.mock("@chatbotx.io/filesystem", () => ({ uploadFileFromUrl: vi.fn() }))
vi.mock("@chatbotx.io/redis", () => ({
  invalidateCacheByTags: vi.fn(),
  withCache: vi.fn(),
}))
vi.mock("@chatbotx.io/analytics", () => ({ macAnalyticsService: {} }))
vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: {},
}))
vi.mock("../src/user-quota/service", () => ({ userQuotaService: {} }))
vi.mock("../src/workspace/service", () => ({ workspaceService: {} }))
vi.mock("../src/workspace-usage/service", () => ({ workspaceUsageService: {} }))
vi.mock("../src/message-cleanup/service", () => ({ messageCleanupService: {} }))

const { contactService } = await import("../src/contact/service")
const { isNull: isNullMock } = await import("@chatbotx.io/database/client")

const buildUpdateClient = () => {
  const where = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  return { set, update, where }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("contactService.subscribeBroadcastIfUnsubscribed", () => {
  test("keeps the isNull(broadcastSubscribedAt) TOCTOU guard inside the UPDATE's WHERE", async () => {
    const client = buildUpdateClient()
    mockDbUpdate.mockImplementation(client.update)

    await contactService.subscribeBroadcastIfUnsubscribed({
      workspaceId: "ws-1",
      contactId: "contact-1",
    })

    expect(isNullMock).toHaveBeenCalledWith("contact.broadcastSubscribedAt")
    expect(client.where).toHaveBeenCalledWith({
      __and: [
        { __eq: ["contact.id", "contact-1"] },
        { __eq: ["contact.workspaceId", "ws-1"] },
        { __isNull: "contact.broadcastSubscribedAt" },
      ],
    })
    expect(client.set).toHaveBeenCalledWith({
      broadcastSubscribedAt: expect.any(Date),
    })
  })

  test("is a single conditional write — no read precedes it", async () => {
    const client = buildUpdateClient()
    const query = { contactModel: { findFirst: vi.fn() } }
    const select = vi.fn()

    await contactService.subscribeBroadcastIfUnsubscribed(
      { workspaceId: "ws-1", contactId: "contact-1" },
      { update: client.update, select, query } as never,
    )

    expect(client.update).toHaveBeenCalledTimes(1)
    expect(select).not.toHaveBeenCalled()
    expect(query.contactModel.findFirst).not.toHaveBeenCalled()
  })
})

describe("contactService.unsubscribeBroadcast", () => {
  test("clears the timestamp unconditionally but stays workspace-scoped", async () => {
    const client = buildUpdateClient()
    mockDbUpdate.mockImplementation(client.update)

    await contactService.unsubscribeBroadcast({
      workspaceId: "ws-1",
      contactId: "contact-1",
    })

    expect(client.set).toHaveBeenCalledWith({ broadcastSubscribedAt: null })
    expect(client.where).toHaveBeenCalledWith({
      __and: [
        { __eq: ["contact.id", "contact-1"] },
        { __eq: ["contact.workspaceId", "ws-1"] },
      ],
    })
    // No conditional guard here — unsubscribe is idempotent by definition.
    expect(isNullMock).not.toHaveBeenCalled()
  })
})

describe("contactService.setAvatarIfEmpty", () => {
  test("keeps the isNull(avatar) TOCTOU guard inside the UPDATE's WHERE", async () => {
    const client = buildUpdateClient()
    mockDbUpdate.mockImplementation(client.update)

    await contactService.setAvatarIfEmpty({
      workspaceId: "ws-1",
      contactId: "contact-1",
      avatar: "https://cdn.example/a.png",
    })

    expect(isNullMock).toHaveBeenCalledWith("contact.avatar")
    expect(client.where).toHaveBeenCalledWith({
      __and: [
        { __eq: ["contact.id", "contact-1"] },
        { __eq: ["contact.workspaceId", "ws-1"] },
        { __isNull: "contact.avatar" },
      ],
    })
    expect(client.set).toHaveBeenCalledWith({
      avatar: "https://cdn.example/a.png",
      updatedAt: expect.any(Date),
    })
  })

  test("is a single conditional write — no read precedes it", async () => {
    const client = buildUpdateClient()
    const query = { contactModel: { findFirst: vi.fn() } }
    const select = vi.fn()

    await contactService.setAvatarIfEmpty(
      { workspaceId: "ws-1", contactId: "contact-1", avatar: "a.png" },
      { update: client.update, select, query } as never,
    )

    expect(client.update).toHaveBeenCalledTimes(1)
    expect(select).not.toHaveBeenCalled()
    expect(query.contactModel.findFirst).not.toHaveBeenCalled()
  })
})

describe("contactService.setFlowFlags", () => {
  test("writes the flags by id and invalidates the contact cache", async () => {
    const client = buildUpdateClient()
    mockDbUpdate.mockImplementation(client.update)
    const invalidateSpy = vi
      .spyOn(contactService, "invalidate")
      .mockResolvedValue(undefined)

    await contactService.setFlowFlags(
      { workspaceId: "ws-1", id: "contact-1" },
      { emailVerified: true },
    )

    expect(client.set).toHaveBeenCalledWith({ emailVerified: true })
    expect(client.where).toHaveBeenCalledWith({
      __eq: ["contact.id", "contact-1"],
    })
    // The raw worker write skipped invalidation, leaving a stale cached
    // contact behind; routing through the service fixes that.
    expect(invalidateSpy).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["contact-1"],
    })
  })

  test("skips the pre-read and the info-change emit that update() would do", async () => {
    const client = buildUpdateClient()
    mockDbUpdate.mockImplementation(client.update)
    vi.spyOn(contactService, "invalidate").mockResolvedValue(undefined)
    const findByIdOrFailSpy = vi.spyOn(contactService, "findByIdOrFail")

    await contactService.setFlowFlags(
      { workspaceId: "ws-1", id: "contact-1" },
      { emailOptIn: true },
    )

    expect(findByIdOrFailSpy).not.toHaveBeenCalled()
  })
})
