// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"
import { handleRefreshWebchatAccessToken } from "@/features/integration-webchat/actions/refresh-webchat-access-token.action"

const {
  mockCheckGuestRateLimit,
  mockFindWebchat,
  mockRefreshWebchatAccessToken,
  mockVerifyRefreshableToken,
  mockWorkspaceFind,
} = vi.hoisted(() => ({
  mockCheckGuestRateLimit: vi.fn(),
  mockFindWebchat: vi.fn(),
  mockRefreshWebchatAccessToken: vi.fn(),
  mockVerifyRefreshableToken: vi.fn(),
  mockWorkspaceFind: vi.fn(),
}))

vi.mock("@/lib/safe-action", () => ({
  actionClient: {
    inputSchema: () => ({
      action: (handler: unknown) => handler,
    }),
  },
}))

vi.mock("@chatbotx.io/business", () => ({
  integrationWebchatService: {
    findByIdForWorkspaceOrNull: mockFindWebchat,
  },
  isWorkspaceScheduledForDeletion: (workspace: {
    scheduledDeletionAt?: Date | string | null
  }) => workspace.scheduledDeletionAt != null,
  workspaceService: { find: mockWorkspaceFind },
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    httpStatusCode: number

    constructor(message: string, code: string, httpStatusCode: number) {
      super(message)
      this.code = code
      this.httpStatusCode = httpStatusCode
    }
  },
}))

vi.mock("@/features/integration-webchat/lib/authorized-domain", () => ({
  isOriginAuthorized: (originHost: string | null, domains: string[]) =>
    originHost !== null && domains.includes(originHost),
}))

vi.mock("@/features/integration-webchat/lib/webchat-access-token", () => ({
  refreshWebchatAccessToken: mockRefreshWebchatAccessToken,
  verifyRefreshableWebchatAccessToken: mockVerifyRefreshableToken,
}))

vi.mock("@/lib/rate-limit/guest-rate-limit", () => ({
  checkGuestRateLimit: mockCheckGuestRateLimit,
  getGuestClientIp: () => "192.0.2.1",
}))

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}))

vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}))

const input = {
  token: "access-token",
  webchatId: "webchat-1",
  workspaceId: "workspace-1",
}

describe("handleRefreshWebchatAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckGuestRateLimit.mockResolvedValue({
      limited: false,
      retryAfter: 10,
    })
    mockFindWebchat.mockResolvedValue({
      authorizedDomains: ["example.com"],
      id: input.webchatId,
    })
    mockRefreshWebchatAccessToken.mockResolvedValue({
      expiresAt: 1_800_000_000,
      originHost: "example.com",
      token: "refreshed-token",
    })
    mockVerifyRefreshableToken.mockResolvedValue({
      iat: 1_700_000_000,
      originHost: "example.com",
    })
    mockWorkspaceFind.mockResolvedValue({ scheduledDeletionAt: null })
  })

  test("rejects a refresh after the signed host is removed from authorizedDomains", async () => {
    mockFindWebchat.mockResolvedValue({
      authorizedDomains: ["other.example"],
      id: input.webchatId,
    })

    await expect(
      handleRefreshWebchatAccessToken({ parsedInput: input }),
    ).rejects.toMatchObject({ code: "forbidden", httpStatusCode: 403 })

    expect(mockRefreshWebchatAccessToken).not.toHaveBeenCalled()
  })

  test("rejects a refresh for a workspace scheduled for deletion", async () => {
    mockWorkspaceFind.mockResolvedValue({ scheduledDeletionAt: new Date() })

    await expect(
      handleRefreshWebchatAccessToken({ parsedInput: input }),
    ).rejects.toMatchObject({
      code: "workspaceScheduledDeletion",
      httpStatusCode: 403,
    })

    expect(mockFindWebchat).not.toHaveBeenCalled()
  })

  test("rejects a refresh when the guest rate limit is exhausted", async () => {
    mockCheckGuestRateLimit.mockResolvedValue({ limited: true, retryAfter: 10 })

    await expect(
      handleRefreshWebchatAccessToken({ parsedInput: input }),
    ).rejects.toMatchObject({
      code: "rateLimitExceeded",
      httpStatusCode: 429,
    })

    expect(mockRefreshWebchatAccessToken).not.toHaveBeenCalled()
  })
})
