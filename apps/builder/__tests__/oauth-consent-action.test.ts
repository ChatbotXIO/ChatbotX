import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertAuthorizableWorkspace: vi.fn(),
  bindConsentWorkspace: vi.fn(),
  calls: [] as string[],
  oauth2Consent: vi.fn(),
  revokeGrant: vi.fn(),
  verifyMcpOAuthQuery: vi.fn(),
}))

vi.mock("@chatbotx.io/auth/mcp-resource", () => ({
  verifyMcpOAuthQuery: mocks.verifyMcpOAuthQuery,
}))

vi.mock("@chatbotx.io/business", () => ({
  mcpOAuthService: {
    assertAuthorizableWorkspace: mocks.assertAuthorizableWorkspace,
    bindConsentWorkspace: mocks.bindConsentWorkspace,
    revokeGrant: mocks.revokeGrant,
  },
}))
vi.mock("@/lib/log", () => ({ logger: { error: vi.fn() } }))
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ cookie: "session=abc" })),
}))
vi.mock("@/lib/auth/auth", () => ({
  auth: {
    $context: Promise.resolve({ baseURL: "http://localhost:3123/api/auth/" }),
    api: { oauth2Consent: mocks.oauth2Consent },
  },
}))
vi.mock("@/lib/safe-action", () => ({
  authActionClient: {
    inputSchema: () => ({ action: (handler: unknown) => handler }),
  },
}))

const [{ submitOAuthConsentAction }, { oauthConsentRequest }] =
  await Promise.all([
    import("../src/features/oauth-consent/actions/consent.action"),
    import("../src/features/oauth-consent/schema/consent"),
  ])

const callAction = (parsedInput: unknown) =>
  (
    submitOAuthConsentAction as unknown as (input: {
      ctx: { user: { email: string; id: string } }
      parsedInput: unknown
    }) => Promise<unknown>
  )({
    ctx: { user: { email: "owner@example.com", id: "user-1" } },
    parsedInput,
  })

describe("submitOAuthConsentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.calls.length = 0
    mocks.verifyMcpOAuthQuery.mockResolvedValue({
      clientId: "claude",
      scopes: ["openid"],
    })
    mocks.assertAuthorizableWorkspace.mockImplementation(() => {
      mocks.calls.push("assert")
      return Promise.resolve()
    })
    mocks.oauth2Consent.mockImplementation(() => {
      mocks.calls.push("consent")
      return Promise.resolve({ url: "https://claude.ai/callback?code=abc" })
    })
    mocks.bindConsentWorkspace.mockImplementation(() => {
      mocks.calls.push("bind")
      return Promise.resolve()
    })
  })

  test("checks the workspace, records consent, then binds it before returning the redirect", async () => {
    const oauthQuery = "client_id=claude&sig=signature"
    await expect(
      callAction({
        accept: true,
        oauthQuery,
        workspaceId: "ws-2",
      }),
    ).resolves.toEqual({ url: "https://claude.ai/callback?code=abc" })

    expect(mocks.calls).toEqual(["assert", "consent", "bind"])
    expect(mocks.bindConsentWorkspace).toHaveBeenCalledWith({
      clientId: "claude",
      user: { email: "owner@example.com", id: "user-1" },
      workspaceId: "ws-2",
    })
  })

  test("passes a request carrying the session so Better Auth can run authorize", async () => {
    await callAction({
      accept: true,
      oauthQuery: "client_id=claude&sig=signature",
      workspaceId: "ws-2",
    })

    const [{ request }] = mocks.oauth2Consent.mock.calls[0] as [
      { request: Request },
    ]
    expect(request.url).toBe("http://localhost:3123/api/auth/oauth2/consent")
    expect(request.method).toBe("POST")
    expect(request.headers.get("cookie")).toBe("session=abc")
  })

  test("asks for a JSON body, not a Response the action cannot serialize", async () => {
    await callAction({
      accept: true,
      oauthQuery: "client_id=claude&sig=signature",
      workspaceId: "ws-2",
    })

    const [{ asResponse, headers }] = mocks.oauth2Consent.mock.calls[0] as [
      { asResponse: boolean; headers: Headers },
    ]
    expect(asResponse).toBe(false)
    expect(headers.get("accept")).toBe("application/json")
  })

  test("revokes the recorded consent and rethrows when binding fails", async () => {
    const bindError = new Error("db down")
    mocks.bindConsentWorkspace.mockRejectedValue(bindError)
    mocks.revokeGrant.mockResolvedValue(true)

    await expect(
      callAction({
        accept: true,
        oauthQuery: "client_id=claude&sig=signature",
        workspaceId: "ws-2",
      }),
    ).rejects.toBe(bindError)
    expect(mocks.revokeGrant).toHaveBeenCalledWith({
      clientId: "claude",
      userId: "user-1",
    })
  })

  test("does not record consent when the workspace is not authorizable", async () => {
    mocks.assertAuthorizableWorkspace.mockRejectedValue(new Error("forbidden"))

    await expect(
      callAction({
        accept: true,
        oauthQuery: "client_id=claude&sig=signature",
        workspaceId: "ws-foreign",
      }),
    ).rejects.toThrow("forbidden")
    expect(mocks.oauth2Consent).not.toHaveBeenCalled()
    expect(mocks.bindConsentWorkspace).not.toHaveBeenCalled()
  })

  test("rejects an unverifiable query before touching the workspace or consent", async () => {
    mocks.verifyMcpOAuthQuery.mockResolvedValueOnce(null)

    await expect(
      callAction({
        accept: true,
        oauthQuery: "client_id=claude&sig=forged",
        workspaceId: "ws-2",
      }),
    ).rejects.toMatchObject({ code: "forbidden" })
    expect(mocks.assertAuthorizableWorkspace).not.toHaveBeenCalled()
    expect(mocks.oauth2Consent).not.toHaveBeenCalled()
    expect(mocks.bindConsentWorkspace).not.toHaveBeenCalled()
  })

  test("a denial skips workspace checks and binding", async () => {
    await callAction({ accept: false, oauthQuery: "client_id=claude&sig=x" })

    expect(mocks.calls).toEqual(["consent"])
  })
})

describe("oauthConsentRequest", () => {
  test("requires a workspace to approve", () => {
    expect(
      oauthConsentRequest.safeParse({
        accept: true,
        oauthQuery: "client_id=claude&sig=signature",
      }).success,
    ).toBe(false)
  })

  test("accepts a denial without a workspace", () => {
    expect(
      oauthConsentRequest.safeParse({
        accept: false,
        oauthQuery: "client_id=claude&sig=signature",
      }).success,
    ).toBe(true)
  })
})
