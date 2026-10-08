// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  startSession: vi.fn(),
  reconnect: vi.fn(),
  sanitizeOptionalReturnUrl: vi.fn(),
  resolveOAuthCredential: vi.fn(),
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  channelHiddenException: (c: string) => new Error(`hidden ${c}`),
  connectionNotConfiguredException: (p: string) => new Error(`nc ${p}`),
}))
vi.mock("@chatbotx.io/connections", () => ({
  CONNECTION_REGISTRY: {
    googleAds: {
      provider: { kind: "integration", strategy: "oauth_redirect" },
    },
  },
  connectionService: {
    startSession: mocks.startSession,
    reconnect: mocks.reconnect,
  },
  isCredentialStrategy: () => false,
  toChannelType: (p: string) => p,
}))
vi.mock("@/lib/oauth-referer", () => ({
  sanitizeOptionalReturnUrl: mocks.sanitizeOptionalReturnUrl,
}))
vi.mock("@/lib/workspace/resolve-visible-channels", () => ({
  resolveChannelPolicy: vi.fn(async () => null),
}))
vi.mock("@/features/connections/lib/resolve-connect-credential", () => ({
  resolveOAuthCredential: mocks.resolveOAuthCredential,
}))

const { startConnect, startReconnect } = await import(
  "@/features/connections/lib/connect-flow"
)

const ABSOLUTE = "https://app.test/space/100/settings/integrations/google-ads"
const RELATIVE = "/space/100/settings/integrations/google-ads"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.resolveOAuthCredential.mockResolvedValue({
    credential: {},
    callbackUrl: "https://app.test/cb",
  })
  mocks.startSession.mockResolvedValue({ session: { id: "s" } })
  mocks.reconnect.mockResolvedValue({ session: { id: "s" } })
})

describe("connect-flow return URL", () => {
  test("startConnect stores the allow-listed absolute URL as a relative path (the session store rejects absolute URLs)", async () => {
    mocks.sanitizeOptionalReturnUrl.mockResolvedValue(`${ABSOLUTE}?a=1#h`)

    await startConnect({
      workspaceId: "100",
      provider: "googleAds",
      config: undefined,
      redirectUrl: ABSOLUTE,
      ownerId: "o",
      actor: { actorUserId: "u" },
    })

    expect(mocks.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        returnUrl: `${RELATIVE}?a=1#h`,
        originHost: "app.test",
      }),
    )
  })

  test("startReconnect does the same", async () => {
    mocks.sanitizeOptionalReturnUrl.mockResolvedValue(ABSOLUTE)

    await startReconnect({
      connection: { id: "c", provider: "googleAds" } as never,
      workspaceId: "100",
      redirectUrl: ABSOLUTE,
      ownerId: "o",
      actor: { actorUserId: "u" },
    })

    expect(mocks.reconnect).toHaveBeenCalledWith(
      expect.objectContaining({ returnUrl: RELATIVE, originHost: "app.test" }),
    )
  })

  test("a disallowed or missing redirect URL leaves the return URL unset", async () => {
    mocks.sanitizeOptionalReturnUrl.mockResolvedValue(undefined)

    await startConnect({
      workspaceId: "100",
      provider: "googleAds",
      config: undefined,
      redirectUrl: "https://evil.test/x",
      ownerId: "o",
      actor: { actorUserId: "u" },
    })

    const call = mocks.startSession.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(call.returnUrl).toBeUndefined()
    expect(call.originHost).toBeUndefined()
  })

  test("a tenant custom-domain redirect URL passes its own host (with port) as originHost", async () => {
    mocks.sanitizeOptionalReturnUrl.mockResolvedValue(
      "https://tenant.example.org:8443/space/1/x",
    )

    await startConnect({
      workspaceId: "100",
      provider: "googleAds",
      config: undefined,
      redirectUrl: "https://tenant.example.org:8443/space/1/x",
      ownerId: "o",
      actor: { actorUserId: "u" },
    })

    expect(mocks.startSession).toHaveBeenCalledWith(
      expect.objectContaining({
        returnUrl: "/space/1/x",
        originHost: "tenant.example.org:8443",
      }),
    )
  })
})
