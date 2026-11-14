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

    it("maps BUC usage to the neutral signal, converting Meta's minutes to ms", async () => {
      mockListConversations.mockResolvedValue({
        data: [],
        bucUsage: {
          callCount: 12,
          totalCpuTime: 34,
          totalTime: 56,
          estimatedTimeToRegainAccess: 2,
        },
      })

      const page = await messengerContactScanAdapter.listPage({ context })

      expect(page.usageSignal).toEqual({
        usagePercent: 56,
        retryAfterMs: 120_000,
      })
    })

    it("does not retry inline: a failure reaches the engine at once", async () => {
      mockListConversations.mockRejectedValue(new Error("boom"))

      await expect(
        messengerContactScanAdapter.listPage({ context }),
      ).rejects.toThrow("boom")
      expect(mockListConversations).toHaveBeenCalledTimes(1)
    })

    it("returns a null usage signal when no BUC header was present", async () => {
      mockListConversations.mockResolvedValue({ data: [] })

      const page = await messengerContactScanAdapter.listPage({ context })

      expect(page.usageSignal).toBeNull()
    })
  })

  describe("classifyError (through the Messenger error mapper)", () => {
    const context = {
      inbox: fakeInbox,
      accessToken: "token",
      version: "v20.0",
      pageId,
    }
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
    const classify = (error: unknown) =>
      messengerContactScanAdapter.classifyError({ error, context })

    it.each([
      4, 17, 32, 613, 80_001, 80_006,
    ])("Graph code %i is rateLimited", (code) => {
      expect(classify(apiException({ httpStatusCode: 400, code }))).toBe(
        "rateLimited",
      )
    })

    it("a 429 is rateLimited", () => {
      expect(classify(apiException({ httpStatusCode: 429 }))).toBe(
        "rateLimited",
      )
    })

    it("a 500 is retryable", () => {
      expect(classify(apiException({ httpStatusCode: 500 }))).toBe("retryable")
    })

    it("Graph code 190 (expired token) is tokenInvalid", () => {
      expect(
        classify(
          apiException({
            httpStatusCode: 401,
            code: 190,
            type: "OAuthException",
          }),
        ),
      ).toBe("tokenInvalid")
    })

    it.each([
      10, 200,
    ])("Graph permission code %i is graphPermission", (code) => {
      expect(classify(apiException({ httpStatusCode: 403, code }))).toBe(
        "graphPermission",
      )
    })

    it("an unrecognized code is unknown", () => {
      expect(classify(apiException({ httpStatusCode: 400, code: 999 }))).toBe(
        "unknown",
      )
    })

    it("a plain non-API error is unknown", () => {
      expect(classify(new Error("boom"))).toBe("unknown")
    })
  })

  describe("readBackoff", () => {
    const context = {
      inbox: fakeInbox,
      accessToken: "token",
      version: "v20.0",
      pageId,
    }

    it("reads Meta's wait (minutes) from the failed call's response headers", () => {
      const exception = new MessengerAPIException(
        "limit",
        429,
        80_006,
        undefined,
        undefined,
        {
          response: {
            headers: new Headers({
              "x-business-use-case-usage": JSON.stringify({
                "1": [
                  {
                    call_count: 100,
                    total_cputime: 20,
                    total_time: 20,
                    estimated_time_to_regain_access: 3,
                  },
                ],
              }),
            }),
          },
        },
      )

      expect(
        messengerContactScanAdapter.readBackoff({ error: exception, context }),
      ).toEqual({ usagePercent: 100, retryAfterMs: 180_000 })
    })

    it("returns null when the error carries no usage header", () => {
      expect(
        messengerContactScanAdapter.readBackoff({
          error: new MessengerAPIException("x", 500),
          context,
        }),
      ).toBeNull()
      expect(
        messengerContactScanAdapter.readBackoff({
          error: new Error("boom"),
          context,
        }),
      ).toBeNull()
    })
  })
})
