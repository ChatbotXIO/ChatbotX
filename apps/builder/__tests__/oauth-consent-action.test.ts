import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  assertAuthorizableWorkspace: vi.fn(),
  bindConsentWorkspace: vi.fn(),
  calls: [] as string[],
  oauth2Consent: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  mcpOAuthService: {
    assertAuthorizableWorkspace: mocks.assertAuthorizableWorkspace,
    bindConsentWorkspace: mocks.bindConsentWorkspace,
  },
}))
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue({}) }))
vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { oauth2Consent: mocks.oauth2Consent } },
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
