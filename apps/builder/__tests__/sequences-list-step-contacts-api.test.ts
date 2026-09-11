import { describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type HandlerInput = {
  workspaceId: string
  sequenceId: string
  stepId: string
  eventType: string
  total?: number
  page: number
  perPage: number
}

type HandlerResult = {
  data: unknown[]
  total: number
  page: number
  pageCount: number
}

type Handler = (args: { input: HandlerInput }) => Promise<HandlerResult>

const { authorizedAPI, mocks, workspaceAuthorizedMidddleware } = vi.hoisted(
  () => {
    const state: { handler?: Handler } = {}

    const procedure = {
      route: vi.fn((_config: RouteConfig) => procedure),
      input: vi.fn((_schema: unknown) => procedure),
      output: vi.fn((_schema: unknown) => procedure),
      use: vi.fn((_middleware: unknown, _mapper: unknown) => procedure),
      handler: vi.fn((handler: Handler) => {
        state.handler = handler
        return { handler }
      }),
    }

    return {
      authorizedAPI: procedure,
      mocks: {
        getContacts: vi.fn(),
        findManyByIds: vi.fn(),
        state,
      },
      workspaceAuthorizedMidddleware: vi.fn(),
    }
  },
)

vi.mock("@/orpc", () => ({ authorizedAPI }))
vi.mock("@/middlewares/auth", () => ({ workspaceAuthorizedMidddleware }))

vi.mock("@chatbotx.io/analytics", () => ({
  sequenceAnalyticsService: {
    getStepStats: vi.fn(),
    getContacts: mocks.getContacts,
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  contactInboxService: { findManyByIds: mocks.findManyByIds },
}))

const { sequencesPrivateAPI } = await import("@/features/sequences/api/private")

describe("privateListSequenceStepContactsAPI", () => {
  test("registers the expected route", () => {
    expect(sequencesPrivateAPI).toHaveProperty(
      "privateListSequenceStepContactsAPI",
    )
  })

  // Regression guard: this route previously emitted the ContactInbox id as
  // `contactId` (copied from the analogous, since-fixed bug in broadcasts'
  // private route). Every row here feeds `StatsContactsDialog` →
  // `addContactTagAction`/`bulkTagStatsContactsAction`, which tags by the
  // real Contact id — a ContactInbox id there silently tags the wrong
  // contact (or fails to resolve one at all).
  test("maps contactId from the event data's Contact id, not the ContactInbox id", async () => {
    const contactInboxId = "contact-inbox-1"
    const realContactId = "contact-1"

    mocks.getContacts.mockResolvedValue({
      contactInboxIds: [contactInboxId],
      contactEventMap: new Map([
        [
          contactInboxId,
          {
            contactId: realContactId,
            errorContent: null,
            occurredAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      ]),
    })

    mocks.findManyByIds.mockResolvedValue([
      {
        id: contactInboxId,
        sourceId: "source-1",
        channel: "whatsapp",
        conversation: { id: "conversation-1" },
        contact: {
          firstName: "Ada",
          lastName: "Lovelace",
          fullName: "Ada Lovelace",
          avatar: null,
        },
      },
    ])

    expect(mocks.state.handler).toBeDefined()
    const result = await mocks.state.handler?.({
      input: {
        workspaceId: "ws-1",
        sequenceId: "seq-1",
        stepId: "step-1",
        eventType: "message:sent",
        total: 1,
        page: 1,
        perPage: 20,
      },
    })

    expect(result?.data).toHaveLength(1)
    expect(result?.data[0]).toMatchObject({
      contactId: realContactId,
      contactInboxId,
      conversationId: "conversation-1",
    })
    expect((result?.data[0] as { contactId: string }).contactId).not.toBe(
      contactInboxId,
    )
  })

  test("drops a contact inbox with no conversation", async () => {
    const contactInboxId = "contact-inbox-1"

    mocks.getContacts.mockResolvedValue({
      contactInboxIds: [contactInboxId],
      contactEventMap: new Map([
        [
          contactInboxId,
          {
            contactId: "contact-1",
            errorContent: null,
            occurredAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      ]),
    })

    mocks.findManyByIds.mockResolvedValue([
      {
        id: contactInboxId,
        sourceId: "source-1",
        channel: "whatsapp",
        conversation: null,
        contact: {
          firstName: null,
          lastName: null,
          fullName: null,
          avatar: null,
        },
      },
    ])

    const result = await mocks.state.handler?.({
      input: {
        workspaceId: "ws-1",
        sequenceId: "seq-1",
        stepId: "step-1",
        eventType: "message:sent",
        total: 1,
        page: 1,
        perPage: 20,
      },
    })

    expect(result?.data).toHaveLength(0)
  })
})
