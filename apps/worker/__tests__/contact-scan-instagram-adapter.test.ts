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

    it("maps app-usage headers to the engine's usage signal shape", async () => {
      mockListInstagramConversations.mockResolvedValue({
        data: [],
        appUsage: { call_count: 5, total_cputime: 10, total_time: 15 },
      })

      const page = await instagramContactScanAdapter.listPage({
        context: nativeContext,
      })

      expect(page.usageSignal).toEqual({
        kind: "meta-app-usage",
        callCount: 5,
        totalCputime: 10,
        totalTime: 15,
      })
    })

    it("returns a null usage signal when no app-usage header was present", async () => {
      mockListInstagramConversations.mockResolvedValue({ data: [] })

      const page = await instagramContactScanAdapter.listPage({
        context: nativeContext,
      })

      expect(page.usageSignal).toBeNull()
    })

    // FIX 4 — this Graph call was previously unretried (unlike the Messenger
    // adapter's `listPage`), so a transient 429/5xx fell straight through as
    // a full page loss. Now wrapped in the shared `withInlineRetry`.
    it("retries a transient (429) failure inline instead of throwing immediately", async () => {
      const transient = { response: { status: 429 } }
      mockListInstagramConversations
        .mockRejectedValueOnce(transient)
        .mockResolvedValueOnce({ data: [] })

      // Spy on global.setTimeout so the inline retry's backoff delay doesn't
      // actually block the test — mirrors the pattern used for BUC-pause
      // assertions in `coexist-messenger-sync.test.ts`.
      const origSetTimeout = global.setTimeout
      vi.spyOn(global, "setTimeout").mockImplementation(
        (fn: TimerHandler, _delay?: number, ...args: unknown[]) => {
          if (typeof fn === "function") {
            fn(...(args as []))
          }
          return origSetTimeout(fn, 0, ...args)
        },
      )

      const page = await instagramContactScanAdapter.listPage({
        context: nativeContext,
      })

      vi.restoreAllMocks()

      expect(mockListInstagramConversations).toHaveBeenCalledTimes(2)
      expect(page.entries).toEqual([])
    })

    it("does not retry a non-retryable failure — it throws immediately", async () => {
      const permanent = { response: { status: 400 } }
      mockListInstagramConversations.mockRejectedValueOnce(permanent)

      await expect(
        instagramContactScanAdapter.listPage({ context: nativeContext }),
      ).rejects.toBe(permanent)
      expect(mockListInstagramConversations).toHaveBeenCalledTimes(1)
    })
  })

  describe("classifyError", () => {
    // Both `@chatbotx.io/integration-instagram` and
    // `@chatbotx.io/integration-instagram-facebook` wrap every Graph failure
    // into their own `InstagramAPIException` (extends `InstagramException`
    // extends `SdkException`) before it escapes
    // `listInstagramConversations`/`listInstagramFacebookConversations` — a
    // flat `httpStatusCode`/`code`/`type`, never a nested `response`/
    // `errorBody` shape.
    const apiException = (fields: {
      httpStatusCode?: number
      code?: string | number
      type?: string
    }) =>
      new InstagramAPIException(
        "graph error",
        fields.httpStatusCode,
        fields.code,
        undefined,
        fields.type,
      )

    it("classifies a 429 InstagramAPIException as retryable", () => {
      const error = apiException({ httpStatusCode: 429 })
      expect(instagramContactScanAdapter.classifyError(error)).toBe("retryable")
    })

    it("classifies a 500 InstagramAPIException as retryable", () => {
      const error = apiException({ httpStatusCode: 500 })
      expect(instagramContactScanAdapter.classifyError(error)).toBe("retryable")
    })

    it("classifies Graph code 190 (expired token) as tokenInvalid", () => {
      const error = apiException({
        httpStatusCode: 401,
        code: 190,
        type: "OAuthException",
      })
      expect(instagramContactScanAdapter.classifyError(error)).toBe(
        "tokenInvalid",
      )
    })

    it("classifies Graph code 10 (permission denied) as graphPermission", () => {
      const error = apiException({ httpStatusCode: 403, code: 10 })
      expect(instagramContactScanAdapter.classifyError(error)).toBe(
        "graphPermission",
      )
    })

    it("classifies a Graph code in the 200-series permission range as graphPermission", () => {
      const error = apiException({ httpStatusCode: 403, code: 200 })
      expect(instagramContactScanAdapter.classifyError(error)).toBe(
        "graphPermission",
      )
    })

    it("classifies Graph code 4 (app-level rate limit) as retryable", () => {
      const error = apiException({ httpStatusCode: 400, code: 4 })
      expect(instagramContactScanAdapter.classifyError(error)).toBe("retryable")
    })

    it("classifies Graph code 613 (custom rate limit) as retryable", () => {
      const error = apiException({ httpStatusCode: 400, code: 613 })
      expect(instagramContactScanAdapter.classifyError(error)).toBe("retryable")
    })

    it("classifies an unrecognized InstagramAPIException as unknown", () => {
      const error = apiException({ httpStatusCode: 400, code: 999 })
      expect(instagramContactScanAdapter.classifyError(error)).toBe("unknown")
    })

    it("classifies a plain non-API error as unknown", () => {
      expect(instagramContactScanAdapter.classifyError(new Error("boom"))).toBe(
        "unknown",
      )
    })
  })
})
