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
        getStepStats: vi.fn(),
        listStepContactsPage: vi.fn(),
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
    getStepStats: mocks.getStepStats,
  },
}))

vi.mock("@chatbotx.io/business/sequence", () => ({
  sequenceService: { listStepContactsPage: mocks.listStepContactsPage },
}))

const { sequencesPrivateAPI } = await import("@/features/sequences/api/private")

describe("privateListSequenceStepContactsAPI", () => {
  test("registers the expected route", () => {
    expect(sequencesPrivateAPI).toHaveProperty(
      "privateListSequenceStepContactsAPI",
    )
  })

  // The existence check, analytics/contact-inbox joins, and row shaping now
  // live in `sequenceService.listStepContactsPage` (shared orchestration —
  // see `packages/business/__tests__` for coverage of contactId mapping and
  // the conversationId fallback). This route's job is just to call it,
  // forward `total` from input, and pass the result through.
  test("calls the service with the request params and returns its result", async () => {
    mocks.listStepContactsPage.mockResolvedValue({
      data: [
        {
          contactId: "contact-1",
          contactInboxId: "contact-inbox-1",
          firstName: "Ada",
          lastName: "Lovelace",
          fullName: "Ada Lovelace",
          sourceId: "source-1",
          avatar: null,
          channel: "whatsapp",
          errorContent: null,
          occurredAt: "2026-01-01T00:00:00.000Z",
          conversationId: "conversation-1",
        },
      ],
      total: 1,
      pageCount: 1,
    })

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

    expect(mocks.listStepContactsPage).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      sequenceId: "seq-1",
      stepId: "step-1",
      eventType: "message:sent",
      total: 1,
      page: 1,
      perPage: 20,
    })
    expect(result).toEqual({
      data: [
        {
          contactId: "contact-1",
          contactInboxId: "contact-inbox-1",
          firstName: "Ada",
          lastName: "Lovelace",
          fullName: "Ada Lovelace",
          sourceId: "source-1",
          avatar: null,
          channel: "whatsapp",
          errorContent: null,
          occurredAt: "2026-01-01T00:00:00.000Z",
          conversationId: "conversation-1",
        },
      ],
      total: 1,
      page: 1,
      pageCount: 1,
    })
  })

  test("defaults a missing total to 0 before calling the service", async () => {
    mocks.listStepContactsPage.mockResolvedValue({
      data: [],
      total: 0,
      pageCount: 0,
    })

    await mocks.state.handler?.({
      input: {
        workspaceId: "ws-1",
        sequenceId: "seq-1",
        stepId: "step-1",
        eventType: "message:sent",
        page: 1,
        perPage: 20,
      },
    })

    expect(mocks.listStepContactsPage).toHaveBeenCalledWith(
      expect.objectContaining({ total: 0 }),
    )
  })
})
