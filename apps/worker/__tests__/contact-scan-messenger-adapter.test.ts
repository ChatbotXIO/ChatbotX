import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockFindByIdForWorkspace, mockFindInbox, mockListConversations } =
  vi.hoisted(() => ({
    mockFindByIdForWorkspace: vi.fn(),
    mockFindInbox: vi.fn(),
    mockListConversations: vi.fn(),
  }))

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: {
    findByIdForWorkspace: mockFindByIdForWorkspace,
  },
  inboxService: {
    find: mockFindInbox,
  },
  extractContactInfo: vi.fn(() => ({})),
}))

vi.mock("@chatbotx.io/integration-messenger/apis/sync", () => ({
  listConversations: mockListConversations,
}))

import { MessengerAPIException } from "@chatbotx.io/integration-messenger/exception"
import { messengerContactScanAdapter } from "../src/integration/handlers/contact-scan/adapters/messenger"

const workspaceId = "ws-1"
const integrationId = "int-messenger-1"
const pageId = "page-111"

const fakeIntegration = {
  id: integrationId,
  workspaceId,
  pageId,
  inboxId: "inbox-1",
  auth: {
    tokens: { accessToken: "access-token-abc" },
    metadata: { version: "v20.0" },
  },
}

const fakeInbox = {
  id: "inbox-1",
  workspaceId,
  channel: "messenger",
}

const participant = (id: string, name?: string) => ({ id, name })

describe("messengerContactScanAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("channel/provider", () => {
    it("declares the messenger channel and provider", () => {
      expect(messengerContactScanAdapter.channel).toBe("messenger")
      expect(messengerContactScanAdapter.provider).toBe("messenger")
    })
  })

  describe("loadContext", () => {
    it("returns null when the integration is not found in this workspace", async () => {
      mockFindByIdForWorkspace.mockResolvedValue(undefined)

      const context = await messengerContactScanAdapter.loadContext({
        workspaceId,
        integrationId,
      })

      expect(context).toBeNull()
      expect(mockFindInbox).not.toHaveBeenCalled()
    })

    it("returns null when the integration's auth jsonb fails schema validation", async () => {
      mockFindByIdForWorkspace.mockResolvedValue({
        ...fakeIntegration,
        auth: { tokens: { notAnAccessToken: true } },
      })

      const context = await messengerContactScanAdapter.loadContext({
        workspaceId,
        integrationId,
      })

      expect(context).toBeNull()
      expect(mockFindInbox).not.toHaveBeenCalled()
    })

    it("returns null when the inbox cannot be resolved in this workspace", async () => {
      mockFindByIdForWorkspace.mockResolvedValue(fakeIntegration)
      mockFindInbox.mockResolvedValue(undefined)

      const context = await messengerContactScanAdapter.loadContext({
        workspaceId,
        integrationId,
      })

      expect(context).toBeNull()
      expect(mockFindInbox).toHaveBeenCalledWith({
        where: { id: fakeIntegration.inboxId, workspaceId },
      })
    })

    it("resolves the full context on success", async () => {
      mockFindByIdForWorkspace.mockResolvedValue(fakeIntegration)
      mockFindInbox.mockResolvedValue(fakeInbox)

      const context = await messengerContactScanAdapter.loadContext({
        workspaceId,
        integrationId,
      })

      expect(context).toEqual({
        inbox: fakeInbox,
        accessToken: "access-token-abc",
        version: "v20.0",
        pageId,
      })
    })
  })

  describe("listPage", () => {
    const context = {
      inbox: fakeInbox,
      accessToken: "token",
      version: "v20.0",
      pageId,
    }

    it("maps conversations to contacts, skipping the page's own participant", async () => {
      mockListConversations.mockResolvedValue({
        data: [
          {
            id: "conv-1",
            participants: {
              data: [
                participant(pageId),
                participant("user-1", "Bob Customer"),
              ],
            },
            updated_time: "2026-01-01T00:00:00Z",
          },
        ],
        after: "cursor-2",
      })

      const page = await messengerContactScanAdapter.listPage({ context })

      expect(page.entries).toEqual([
        {
          contact: {
            sourceId: "user-1",
            firstName: "Bob",
            lastName: "Customer",
          },
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ])
      expect(page.after).toBe("cursor-2")
    })

    it("maps a missing updated_time to a null updatedAt", async () => {
      mockListConversations.mockResolvedValue({
        data: [
          {
            id: "conv-1",
            participants: { data: [participant("user-1", "Solo Name")] },
          },
        ],
      })

      const page = await messengerContactScanAdapter.listPage({ context })

      expect(page.entries[0].updatedAt).toBeNull()
      expect(page.entries[0].contact.firstName).toBe("Solo")
      expect(page.entries[0].contact.lastName).toBe("Name")
    })

    it("skips a conversation whose only participant is the page itself", async () => {
      mockListConversations.mockResolvedValue({
        data: [
          {
            id: "conv-1",
            participants: { data: [participant(pageId)] },
            updated_time: "2026-01-01T00:00:00Z",
          },
        ],
      })

      const page = await messengerContactScanAdapter.listPage({ context })

      expect(page.entries).toEqual([])
    })

    it("maps BUC usage headers to the engine's usage signal shape", async () => {
      mockListConversations.mockResolvedValue({
        data: [],
        bucUsage: {
          callCount: 12,
          totalCpuTime: 34,
          totalTime: 56,
          estimatedTimeToRegainAccess: 0,
        },
      })

      const page = await messengerContactScanAdapter.listPage({ context })

      expect(page.usageSignal).toEqual({
        kind: "meta-business-use-case-usage",
        callCount: 12,
        totalCputime: 34,
        totalTime: 56,
        estimatedTimeToRegainAccess: 0,
      })
    })

    it("returns a null usage signal when no BUC header was present", async () => {
      mockListConversations.mockResolvedValue({ data: [] })

      const page = await messengerContactScanAdapter.listPage({ context })

      expect(page.usageSignal).toBeNull()
    })
  })

  describe("classifyError", () => {
    // `rescue()` (`@chatbotx.io/integration-messenger/exception`) wraps every
    // Graph failure `listConversations` can throw into a `MessengerAPIException`
    // (`extends SdkException`) — a *flat* `httpStatusCode`/`code`/`type`, never
    // the raw, nested `{ response: { status } }` / `{ response: { error } }`
    // shape a ky `HTTPError` would carry. Before the fix, the classifier
    // re-parsed this flat exception as if it were still that raw shape (via
    // `parseOriginError`), which doesn't recognize it and silently falls back
    // to `{ httpStatusCode: 400 (fallback), code: undefined, type: undefined }`
    // — every case below except the last two would have returned "unknown"
    // against the pre-fix implementation, including the 429/500 cases that
    // should terminate as retryable rather than as a failed scan.
    const apiException = (fields: {
      httpStatusCode?: number
      code?: string | number
      type?: string
    }) =>
      new MessengerAPIException(
        "graph error",
        fields.httpStatusCode,
        fields.code,
        undefined,
        fields.type,
      )

    it("classifies a 429 MessengerAPIException as retryable", () => {
      const error = apiException({ httpStatusCode: 429 })
      expect(messengerContactScanAdapter.classifyError(error)).toBe("retryable")
    })

    it("classifies a 500 MessengerAPIException as retryable", () => {
      const error = apiException({ httpStatusCode: 500 })
      expect(messengerContactScanAdapter.classifyError(error)).toBe("retryable")
    })

    it("classifies Graph code 4 (app-level rate limit) as retryable even without a 429/5xx status", () => {
      const error = apiException({ httpStatusCode: 400, code: 4 })
      expect(messengerContactScanAdapter.classifyError(error)).toBe("retryable")
    })

    it("classifies Graph code 190 (expired token) as tokenInvalid", () => {
      const error = apiException({
        httpStatusCode: 401,
        code: 190,
        type: "OAuthException",
      })
      expect(messengerContactScanAdapter.classifyError(error)).toBe(
        "tokenInvalid",
      )
    })

    it("classifies Graph code 10 (permission denied) as graphPermission", () => {
      const error = apiException({ httpStatusCode: 403, code: 10 })
      expect(messengerContactScanAdapter.classifyError(error)).toBe(
        "graphPermission",
      )
    })

    it("classifies a Graph code in the 200-series permission range as graphPermission", () => {
      const error = apiException({ httpStatusCode: 403, code: 200 })
      expect(messengerContactScanAdapter.classifyError(error)).toBe(
        "graphPermission",
      )
    })

    it("classifies an unrecognized MessengerAPIException as unknown", () => {
      const error = apiException({ httpStatusCode: 400, code: 999 })
      expect(messengerContactScanAdapter.classifyError(error)).toBe("unknown")
    })

    it("classifies a plain non-API error as unknown", () => {
      expect(messengerContactScanAdapter.classifyError(new Error("boom"))).toBe(
        "unknown",
      )
    })
  })
})
