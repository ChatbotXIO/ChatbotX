import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  mockFindByIdForWorkspace,
  mockFindInbox,
  mockListInstagramConversations,
  mockListInstagramFacebookConversations,
} = vi.hoisted(() => ({
  mockFindByIdForWorkspace: vi.fn(),
  mockFindInbox: vi.fn(),
  mockListInstagramConversations: vi.fn(),
  mockListInstagramFacebookConversations: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  instagramIntegrationService: {
    findByIdForWorkspace: mockFindByIdForWorkspace,
  },
  inboxService: {
    find: mockFindInbox,
  },
  extractContactInfo: vi.fn(() => ({})),
}))

vi.mock("@chatbotx.io/integration-instagram/apis/sync", () => ({
  listInstagramConversations: mockListInstagramConversations,
}))

vi.mock("@chatbotx.io/integration-instagram-facebook/apis/sync", () => ({
  listInstagramFacebookConversations: mockListInstagramFacebookConversations,
}))

// The adapter now imports `withInlineRetry` from the Messenger coexist
// helpers (FIX 4). That module also imports `listMessages` from this
// package — stubbed here (unused by these tests) purely to keep the module
// graph hermetic instead of pulling in the real Graph HTTP client.
vi.mock("@chatbotx.io/integration-messenger/apis/sync", () => ({
  listMessages: vi.fn(),
}))

import { InstagramAPIException } from "@chatbotx.io/integration-instagram/exception"
import { instagramContactScanAdapter } from "../src/integration/handlers/contact-scan/adapters/instagram"

const workspaceId = "ws-1"
const integrationId = "int-instagram-1"
const igId = "ig-111"
const pageId = "page-222"

const fakeNativeIntegration = {
  id: integrationId,
  workspaceId,
  type: "instagram" as const,
  igId,
  pageId,
  inboxId: "inbox-1",
  auth: {
    tokens: { accessToken: "access-token-abc" },
    metadata: { version: "v20.0" },
  },
}

const fakeFacebookIntegration = {
  ...fakeNativeIntegration,
  type: "facebook" as const,
}

const fakeInbox = {
  id: "inbox-1",
  workspaceId,
  channel: "instagram",
}

const participant = (
  id: string,
  extra: { name?: string; username?: string } = {},
) => ({
  id,
  ...extra,
})

const nativeContext = {
  providerType: "instagram" as const,
  inbox: fakeInbox,
  accessToken: "token",
  version: "v20.0",
  igId,
}

const facebookContext = {
  providerType: "facebook" as const,
  inbox: fakeInbox,
  accessToken: "token",
  version: "v20.0",
  igId,
  pageId,
}

describe("instagramContactScanAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("channel/provider", () => {
    it("declares the instagram channel and provider", () => {
      expect(instagramContactScanAdapter.channel).toBe("instagram")
      expect(instagramContactScanAdapter.provider).toBe("instagram")
    })
  })

  describe("loadContext", () => {
    it("returns null when the integration is not found in this workspace", async () => {
      mockFindByIdForWorkspace.mockResolvedValue(undefined)

      const context = await instagramContactScanAdapter.loadContext({
        workspaceId,
        integrationId,
      })

      expect(context).toBeNull()
      expect(mockFindInbox).not.toHaveBeenCalled()
    })

    it("returns null when the integration's auth jsonb fails schema validation", async () => {
      mockFindByIdForWorkspace.mockResolvedValue({
        ...fakeNativeIntegration,
        auth: { tokens: { notAnAccessToken: true } },
      })

      const context = await instagramContactScanAdapter.loadContext({
        workspaceId,
        integrationId,
      })

      expect(context).toBeNull()
      expect(mockFindInbox).not.toHaveBeenCalled()
    })

    it("returns null when the inbox cannot be resolved in this workspace", async () => {
      mockFindByIdForWorkspace.mockResolvedValue(fakeNativeIntegration)
      mockFindInbox.mockResolvedValue(undefined)

      const context = await instagramContactScanAdapter.loadContext({
        workspaceId,
        integrationId,
      })

      expect(context).toBeNull()
      expect(mockFindInbox).toHaveBeenCalledWith({
        where: { id: fakeNativeIntegration.inboxId, workspaceId },
      })
    })

    it("resolves a native (type: instagram) context without a pageId field", async () => {
      mockFindByIdForWorkspace.mockResolvedValue(fakeNativeIntegration)
      mockFindInbox.mockResolvedValue(fakeInbox)

      const context = await instagramContactScanAdapter.loadContext({
        workspaceId,
        integrationId,
      })

      expect(context).toEqual({
        providerType: "instagram",
        inbox: fakeInbox,
        accessToken: "access-token-abc",
        version: "v20.0",
        igId,
      })
    })

    it("resolves a Facebook-linked (type: facebook) context with pageId", async () => {
      mockFindByIdForWorkspace.mockResolvedValue(fakeFacebookIntegration)
      mockFindInbox.mockResolvedValue(fakeInbox)

      const context = await instagramContactScanAdapter.loadContext({
        workspaceId,
        integrationId,
      })

      expect(context).toEqual({
        providerType: "facebook",
        inbox: fakeInbox,
        accessToken: "access-token-abc",
        version: "v20.0",
        igId,
        pageId,
      })
    })
  })

  describe("listPage", () => {
    it("dispatches to listInstagramConversations for a native context", async () => {
      mockListInstagramConversations.mockResolvedValue({ data: [] })

      await instagramContactScanAdapter.listPage({ context: nativeContext })

      expect(mockListInstagramConversations).toHaveBeenCalledWith({
        igUserId: igId,
        accessToken: "token",
        version: "v20.0",
        after: undefined,
      })
      expect(mockListInstagramFacebookConversations).not.toHaveBeenCalled()
    })

    it("dispatches to listInstagramFacebookConversations for a Facebook-linked context", async () => {
      mockListInstagramFacebookConversations.mockResolvedValue({ data: [] })

      await instagramContactScanAdapter.listPage({
        context: facebookContext,
        cursor: "cursor-1",
      })

      expect(mockListInstagramFacebookConversations).toHaveBeenCalledWith({
        pageId,
        accessToken: "token",
        version: "v20.0",
        after: "cursor-1",
      })
      expect(mockListInstagramConversations).not.toHaveBeenCalled()
    })

    it("maps conversations to contacts via the shared normalizer, skipping the business's own participant", async () => {
      mockListInstagramConversations.mockResolvedValue({
        data: [
          {
            id: "conv-1",
            participants: {
              data: [
                participant(igId),
                participant("user-1", { name: "Bob Customer" }),
              ],
            },
            updated_time: "2026-01-01T00:00:00Z",
          },
        ],
        after: "cursor-2",
      })

      const page = await instagramContactScanAdapter.listPage({
        context: nativeContext,
      })

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

    it("falls back to the username when no display name is present", async () => {
      mockListInstagramConversations.mockResolvedValue({
        data: [
          {
            id: "conv-1",
            participants: {
              data: [participant("user-1", { username: "bob_ig" })],
            },
          },
        ],
      })

      const page = await instagramContactScanAdapter.listPage({
        context: nativeContext,
      })

      expect(page.entries[0].contact).toEqual({
        sourceId: "user-1",
        firstName: "bob_ig",
        lastName: undefined,
        sourceUsername: "bob_ig",
      })
      expect(page.entries[0].updatedAt).toBeNull()
    })

    it("skips a conversation whose only participant is the business account itself", async () => {
      mockListInstagramConversations.mockResolvedValue({
        data: [
          {
            id: "conv-1",
            participants: { data: [participant(igId)] },
            updated_time: "2026-01-01T00:00:00Z",
          },
        ],
      })

      const page = await instagramContactScanAdapter.listPage({
        context: nativeContext,
      })

      expect(page.entries).toEqual([])
    })

    it("maps app-usage headers to the neutral usage signal", async () => {
      mockListInstagramConversations.mockResolvedValue({
        data: [],
        appUsage: { call_count: 5, total_cputime: 10, total_time: 15 },
      })

      const page = await instagramContactScanAdapter.listPage({
        context: nativeContext,
      })

      expect(page.usageSignal).toEqual({ usagePercent: 15 })
    })

    it("returns a null usage signal when no app-usage header was present", async () => {
      mockListInstagramConversations.mockResolvedValue({ data: [] })

      const page = await instagramContactScanAdapter.listPage({
        context: nativeContext,
      })

      expect(page.usageSignal).toBeNull()
    })

    it("does not retry inline: a failure reaches the engine at once", async () => {
      const failure = new Error("boom")
      mockListInstagramConversations.mockRejectedValueOnce(failure)

      await expect(
        instagramContactScanAdapter.listPage({ context: nativeContext }),
      ).rejects.toBe(failure)
      expect(mockListInstagramConversations).toHaveBeenCalledTimes(1)
    })
  })

  describe("classifyError (through each provider's error mapper)", () => {
    type ExceptionFields = {
      httpStatusCode?: number
      code?: string | number
      type?: string
    }
    // Each provider throws its OWN exception class, which its own mapper reads.
    const apiException = (fields: ExceptionFields) =>
      new InstagramAPIException(
        "graph error",
        fields.httpStatusCode,
        fields.code,
        undefined,
        fields.type,
      )
    // The Facebook package exports no exception class, so its mapper is fed the
    // raw `{ httpStatus, errorBody }` origin shape it also understands.
    const facebookApiException = (fields: ExceptionFields) => ({
      httpStatus: fields.httpStatusCode,
      errorBody: { error: { code: fields.code, type: fields.type } },
    })
    const classify = (error: unknown, context = nativeContext) =>
      instagramContactScanAdapter.classifyError({ error, context })

    it("a 429 is rateLimited and a 500 is retryable", () => {
      expect(classify(apiException({ httpStatusCode: 429 }))).toBe(
        "rateLimited",
      )
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

    it.each([10, 200])("permission code %i is graphPermission", (code) => {
      expect(classify(apiException({ httpStatusCode: 403, code }))).toBe(
        "graphPermission",
      )
    })

    it.each([
      4, 17, 613,
    ])("Graph code %i is rateLimited on both providers", (code) => {
      const fields = { httpStatusCode: 400, code }
      expect(classify(apiException(fields), nativeContext)).toBe("rateLimited")
      expect(classify(facebookApiException(fields), facebookContext)).toBe(
        "rateLimited",
      )
    })

    it("code 80002 is rateLimited on both providers (reason only, so sends keep their category)", () => {
      const fields = { httpStatusCode: 400, code: 80_002 }
      expect(classify(apiException(fields), nativeContext)).toBe("rateLimited")
      expect(classify(facebookApiException(fields), facebookContext)).toBe(
        "rateLimited",
      )
    })

    it.each([
      32, 80_001,
    ])("code %i is rateLimited only for Instagram via Facebook", (code) => {
      const fields = { httpStatusCode: 400, code }
      expect(classify(facebookApiException(fields), facebookContext)).toBe(
        "rateLimited",
      )
      expect(classify(apiException(fields), nativeContext)).not.toBe(
        "rateLimited",
      )
    })

    it("an unrecognized code is unknown, and a plain error is unknown", () => {
      expect(classify(apiException({ httpStatusCode: 400, code: 999 }))).toBe(
        "unknown",
      )
      expect(classify(new Error("boom"))).toBe("unknown")
    })
  })

  describe("readBackoff", () => {
    it("reads Meta's wait (minutes) from the failed call's response headers", () => {
      const exception = new InstagramAPIException(
        "limit",
        429,
        4,
        undefined,
        undefined,
        {
          response: {
            headers: new Headers({
              "x-business-use-case-usage": JSON.stringify({
                "1": [
                  {
                    call_count: 96,
                    total_cputime: 10,
                    total_time: 10,
                    estimated_time_to_regain_access: 4,
                  },
                ],
              }),
            }),
          },
        },
      )

      expect(
        instagramContactScanAdapter.readBackoff({
          error: exception,
          context: nativeContext,
        }),
      ).toEqual({ usagePercent: 96, retryAfterMs: 240_000 })
    })

    it("returns null without a usage header", () => {
      expect(
        instagramContactScanAdapter.readBackoff({
          error: new Error("boom"),
          context: nativeContext,
        }),
      ).toBeNull()
    })
  })
})
