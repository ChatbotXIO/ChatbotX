import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getContacts: vi.fn(),
  findManyByIds: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  and: vi.fn(),
  db: {},
  eq: vi.fn(),
  findOrFail: vi.fn(),
  isUniqueViolationError: vi.fn(),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  sequenceModel: {},
  sequenceStepModel: {},
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  sequenceRepository: {},
}))

vi.mock("@chatbotx.io/database/utils", () => ({
  getPaginationWithDefaults: vi.fn(),
}))

vi.mock("@chatbotx.io/analytics", () => ({
  sequenceAnalyticsService: { getContacts: mocks.getContacts },
}))

vi.mock("../src/contact-inbox/service", () => ({
  contactInboxService: { findManyByIds: mocks.findManyByIds },
}))

const { sequenceService } = await import("../src/sequence/service")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("sequenceService.listStepContactsPage", () => {
  test("returns an empty page without a contact-inbox lookup when there are no matching recipients", async () => {
    mocks.getContacts.mockResolvedValueOnce({
      contactInboxIds: [],
      contactEventMap: new Map(),
    })

    const result = await sequenceService.listStepContactsPage({
      workspaceId: "ws-1",
      sequenceId: "seq-1",
      stepId: "step-1",
      eventType: "message:sent",
      total: 5,
      page: 1,
      perPage: 20,
    })

    expect(result).toEqual({ data: [], total: 5, pageCount: 1 })
    expect(mocks.findManyByIds).not.toHaveBeenCalled()
  })

  test("defaults a falsy total to 0", async () => {
    mocks.getContacts.mockResolvedValueOnce({
      contactInboxIds: [],
      contactEventMap: new Map(),
    })

    const result = await sequenceService.listStepContactsPage({
      workspaceId: "ws-1",
      sequenceId: "seq-1",
      stepId: "step-1",
      eventType: "message:sent",
      total: 0,
      page: 1,
      perPage: 20,
    })

    expect(result.total).toBe(0)
    expect(result.pageCount).toBe(0)
  })

  test("joins recipient events with contact-inbox details, defaulting a missing conversationId to an empty string", async () => {
    mocks.getContacts.mockResolvedValueOnce({
      contactInboxIds: ["ci-1", "ci-no-conversation"],
      contactEventMap: new Map([
        [
          "ci-1",
          {
            contactId: "contact-1",
            occurredAt: "2026-01-01T00:00:00.000Z",
            errorContent: null,
          },
        ],
        [
          "ci-no-conversation",
          {
            contactId: "contact-2",
            occurredAt: "2026-01-02T00:00:00.000Z",
            errorContent: null,
          },
        ],
      ]),
    })
    mocks.findManyByIds.mockResolvedValueOnce([
      {
        id: "ci-1",
        sourceId: "src-1",
        channel: "whatsapp",
        conversation: { id: "conv-1" },
        contact: {
          id: "contact-1",
          firstName: "Ada",
          lastName: "Lovelace",
          fullName: "Ada Lovelace",
          avatar: null,
        },
      },
      {
        id: "ci-no-conversation",
        sourceId: "src-2",
        channel: "whatsapp",
        conversation: null,
        contact: {
          id: "contact-2",
          firstName: "Bea",
          lastName: null,
          fullName: "Bea",
          avatar: null,
        },
      },
    ])

    const result = await sequenceService.listStepContactsPage({
      workspaceId: "ws-1",
      sequenceId: "seq-1",
      stepId: "step-1",
      eventType: "message:sent",
      total: 2,
      page: 1,
      perPage: 20,
    })

    // Both rows are kept — a contact inbox with no conversation still
    // belongs in the page; this is the sequences-side behaviour change from
    // the previous per-handler implementation, which dropped such rows.
    expect(result.data).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.pageCount).toBe(1)
    expect(result.data[0]).toMatchObject({
      contactId: "contact-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
    })
    expect(result.data[1]).toMatchObject({
      contactId: "contact-2",
      contactInboxId: "ci-no-conversation",
      conversationId: "",
    })
  })

  test("drops a recipient whose contact-inbox no longer resolves, leaving pageCount driven by the caller-supplied total", async () => {
    mocks.getContacts.mockResolvedValueOnce({
      contactInboxIds: ["ci-1", "ci-gone"],
      contactEventMap: new Map([
        [
          "ci-1",
          {
            contactId: "contact-1",
            occurredAt: "2026-01-01T00:00:00.000Z",
            errorContent: null,
          },
        ],
        [
          "ci-gone",
          {
            contactId: "contact-gone",
            occurredAt: "2026-01-02T00:00:00.000Z",
            errorContent: null,
          },
        ],
      ]),
    })
    // `getContacts` scopes by the sequence's workspace while `findManyByIds`
    // scopes by `Contact.workspaceId`, so a contact deleted or moved out of
    // the workspace after the event fired is counted in `total` but has no
    // row here.
    mocks.findManyByIds.mockResolvedValueOnce([
      {
        id: "ci-1",
        sourceId: "src-1",
        channel: "whatsapp",
        conversation: { id: "conv-1" },
        contact: {
          id: "contact-1",
          firstName: "Ada",
          lastName: null,
          fullName: "Ada",
          avatar: null,
        },
      },
    ])

    const result = await sequenceService.listStepContactsPage({
      workspaceId: "ws-1",
      sequenceId: "seq-1",
      stepId: "step-1",
      eventType: "message:sent",
      total: 2,
      page: 1,
      perPage: 20,
    })

    // Unresolvable rows are dropped rather than emitted as nulls, and
    // `pageCount` stays anchored to the caller-supplied total — so
    // `data.length` can be shorter than the total implies.
    expect(result.data).toHaveLength(1)
    expect(result.total).toBe(2)
    expect(result.pageCount).toBe(1)
    expect(result.data[0]).toMatchObject({
      contactId: "contact-1",
      contactInboxId: "ci-1",
      conversationId: "conv-1",
    })
  })

  test("threads workspaceId through the analytics lookup and contact-inbox fetch", async () => {
    mocks.getContacts.mockResolvedValueOnce({
      contactInboxIds: ["ci-1"],
      contactEventMap: new Map([
        [
          "ci-1",
          {
            contactId: "contact-1",
            occurredAt: "2026-01-01T00:00:00.000Z",
            errorContent: null,
          },
        ],
      ]),
    })
    mocks.findManyByIds.mockResolvedValueOnce([
      {
        id: "ci-1",
        sourceId: "src-1",
        channel: "whatsapp",
        conversation: { id: "conv-1" },
        contact: {
          id: "contact-1",
          firstName: "Ada",
          lastName: null,
          fullName: "Ada",
          avatar: null,
        },
      },
    ])

    await sequenceService.listStepContactsPage({
      workspaceId: "ws-1",
      sequenceId: "seq-1",
      stepId: "step-1",
      eventType: "message:sent",
      total: 1,
      page: 1,
      perPage: 20,
    })

    expect(mocks.getContacts).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-1" }),
    )
    expect(mocks.findManyByIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["ci-1"],
    })
  })
})
