// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---- hoisted helpers: must be defined before vi.mock calls -----------------
const { MockSendGridApiError, mockRunAction } = vi.hoisted(() => {
  class MockSendGridApiError extends Error {
    readonly statusCode: number
    constructor(props: { message: string; statusCode: number }) {
      super(props.message)
      this.statusCode = props.statusCode
      this.name = "SendGridApiError"
    }
  }
  return { MockSendGridApiError, mockRunAction: vi.fn() }
})

// ---- mock: database client -----------------------------------------------
vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      workspaceMemberModel: {
        findFirst: vi.fn(async () => ({
          workspace: { id: "ws-1" },
          workspaceId: "ws-1",
          userId: "user-1",
        })),
      },
    },
  },
  eq: vi.fn((_col: unknown, val: unknown) => ({ col: _col, val })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}))

// ---- mock: database schema (pass-through avoids Drizzle init issues) ------
vi.mock("@chatbotx.io/database/schema", async (importOriginal) =>
  importOriginal<typeof import("@chatbotx.io/database/schema")>(),
)

// ---- mock: logger -----------------------------------------------------------
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

// ---- mock: auth (prevent real Better-Auth init) ----------------------------
vi.mock("@/lib/auth/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        session: { id: "sess-1" },
        user: { id: "user-1", email: "test@test.com", isAnonymous: false },
      })),
    },
  },
}))

// ---- mock: worker-config (prevent Redis init) ------------------------------
vi.mock("@chatbotx.io/worker-config", () => ({
  getRedisConnection: () => ({}),
  // Referenced at module scope by packages/business's coexist/workspace
  // services (pulled in transitively) — plain constants, no side effects.
  IntegrationJobAction: {
    coexistMessengerSync: "coexistMessengerSync",
    coexistInstagramSync: "coexistInstagramSync",
  },
  PURGE_WORKSPACES_INTERVAL_MINUTES: 30,
}))

// ---- mock: getSendGridContext -----------------------------------------------
const mockGetSendGridContext = vi.fn()
vi.mock("@/features/integration-sendgrid/queries", () => ({
  getSendGridContext: mockGetSendGridContext,
}))

// ---- mock: integration (manual — avoids importOriginal transitive deps) ----
vi.mock("@chatbotx.io/integration-sendgrid", async () => {
  const { z } = await import("zod")
  return {
    SendGridApiError: MockSendGridApiError,
    integration: { runAction: mockRunAction },
    sendGridListPageSchema: z.object({
      data: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          contactCount: z.number().optional(),
        }),
      ),
      nextPageToken: z.string().optional(),
      count: z.number().optional(),
    }),
    sendGridCustomFieldSchema: z.object({
      id: z.string(),
      name: z.string(),
      fieldType: z.enum(["Text", "Number", "Date"]),
    }),
  }
})

// ---- dynamic imports AFTER mocks -------------------------------------------
const { call } = await import("@orpc/server")
const { integrationSendGridAPI } = await import(
  "@/features/integration-sendgrid/api"
)
const { db } = await import("@chatbotx.io/database/client")

const stubCtx = { headers: new Headers({ authorization: "Bearer test-token" }) }
const stubSendGridCtx = { auth: { authType: "custom", apiKey: "key" } }

// ---- tests -----------------------------------------------------------------
describe("integrationSendGridAPI", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(
      db.query.workspaceMemberModel.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      workspace: { id: "ws-1" },
      workspaceId: "ws-1",
      userId: "user-1",
    })
    mockGetSendGridContext.mockResolvedValue(stubSendGridCtx)
  })

  describe("listLists", () => {
    test("returns page data from integration action", async () => {
      mockRunAction.mockResolvedValueOnce({
        data: [{ id: "list-1", name: "Customers", contactCount: 3 }],
        nextPageToken: undefined,
        count: 1,
      })
      const result = await call(
        integrationSendGridAPI.listLists,
        { workspaceId: "ws-1" },
        { context: stubCtx },
      )
      expect(result.data).toHaveLength(1)
      expect(result.data[0]).toMatchObject({ id: "list-1", name: "Customers" })
      expect(mockRunAction).toHaveBeenCalledWith(
        "listLists",
        expect.objectContaining({ props: { pageSize: 1000 } }),
      )
    })

    test("forwards pageToken to integration action", async () => {
      mockRunAction.mockResolvedValueOnce({
        data: [],
        nextPageToken: undefined,
      })
      await call(
        integrationSendGridAPI.listLists,
        { workspaceId: "ws-1", pageToken: "tok-abc" },
        { context: stubCtx },
      )
      expect(mockRunAction).toHaveBeenCalledWith(
        "listLists",
        expect.objectContaining({
          props: expect.objectContaining({ pageToken: "tok-abc" }),
        }),
      )
    })

    test("maps 429 SendGridApiError to TOO_MANY_REQUESTS", async () => {
      mockRunAction.mockRejectedValueOnce(
        new MockSendGridApiError({ message: "rate limited", statusCode: 429 }),
      )
      await expect(
        call(
          integrationSendGridAPI.listLists,
          { workspaceId: "ws-1" },
          { context: stubCtx },
        ),
      ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
    })

    test("propagates non-429 provider errors unchanged", async () => {
      mockRunAction.mockRejectedValueOnce(
        new MockSendGridApiError({ message: "server error", statusCode: 500 }),
      )
      await expect(
        call(
          integrationSendGridAPI.listLists,
          { workspaceId: "ws-1" },
          { context: stubCtx },
        ),
      ).rejects.toThrow("server error")
    })

    test("propagates missing integration error", async () => {
      mockGetSendGridContext.mockRejectedValueOnce(
        new Error("SendGrid integration not found"),
      )
      await expect(
        call(
          integrationSendGridAPI.listLists,
          { workspaceId: "ws-1" },
          { context: stubCtx },
        ),
      ).rejects.toThrow("SendGrid integration not found")
    })
  })

  describe("listCustomFields", () => {
    test("returns custom fields wrapped in data", async () => {
      mockRunAction.mockResolvedValueOnce([
        { id: "field-1", name: "Plan", fieldType: "Text" },
      ])
      const result = await call(
        integrationSendGridAPI.listCustomFields,
        { workspaceId: "ws-1" },
        { context: stubCtx },
      )
      expect(result.data).toEqual([
        { id: "field-1", name: "Plan", fieldType: "Text" },
      ])
    })

    test("maps 429 SendGridApiError to TOO_MANY_REQUESTS", async () => {
      mockRunAction.mockRejectedValueOnce(
        new MockSendGridApiError({ message: "rate limited", statusCode: 429 }),
      )
      await expect(
        call(
          integrationSendGridAPI.listCustomFields,
          { workspaceId: "ws-1" },
          { context: stubCtx },
        ),
      ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" })
    })

    test("propagates missing integration error", async () => {
      mockGetSendGridContext.mockRejectedValueOnce(
        new Error("SendGrid integration not found"),
      )
      await expect(
        call(
          integrationSendGridAPI.listCustomFields,
          { workspaceId: "ws-1" },
          { context: stubCtx },
        ),
      ).rejects.toThrow("SendGrid integration not found")
    })
  })
})
