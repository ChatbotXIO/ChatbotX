import type { HandleRequestProps } from "@chatbotx.io/sdk"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { TiktokMissingScopesError } from "../src/exception"
import {
  TIKTOK_COMMENT_AUTOMATION_SCOPES,
  TIKTOK_CORE_SCOPES,
} from "../src/lib/scopes"
import type { TiktokConfig } from "../src/schema"

const exchangeCodeForToken = vi.fn()
const getUserInfo = vi.fn()

vi.mock("../src/apis/auth", () => ({ exchangeCodeForToken }))
vi.mock("../src/apis/user", () => ({ getUserInfo }))

const { callbackHandler } = await import("../src/handlers/callback")

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUrl: "https://example.com/integrations/tiktok/callback",
} as TiktokConfig

const run = (grantedScopes: readonly string[]) => {
  exchangeCodeForToken.mockResolvedValue({
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: 86_400,
    refresh_expires_in: 31_536_000,
    open_id: "open-1",
    scope: grantedScopes.join(","),
  })

  return callbackHandler({
    req: new Request("https://example.com/callback?code=auth-code"),
    config,
  } as HandleRequestProps<TiktokConfig>)
}

beforeEach(() => {
  vi.clearAllMocks()
  getUserInfo.mockResolvedValue({
    open_id: "open-1",
    username: "acme",
    display_name: "Acme",
    avatar_url: "https://cdn.example.com/a.jpg",
  })
})

describe("callbackHandler scope enforcement", () => {
  test("stores the granted scopes when everything was granted", async () => {
    const auth = await run([
      ...TIKTOK_CORE_SCOPES,
      ...TIKTOK_COMMENT_AUTOMATION_SCOPES,
    ])

    expect(auth.metadata.scopes).toEqual([
      ...TIKTOK_CORE_SCOPES,
      ...TIKTOK_COMMENT_AUTOMATION_SCOPES,
    ])
  })

  // TikTok's consent screen lets each permission be unticked individually, so
  // a grant without Business Messaging is an ordinary outcome — and a channel
  // that cannot send is worse than no channel at all.
  test("refuses a grant missing a core scope, naming what is missing", async () => {
    const withoutSend = TIKTOK_CORE_SCOPES.filter(
      (scope) => scope !== "message.list.send",
    )

    await expect(run(withoutSend)).rejects.toThrow(TiktokMissingScopesError)
    await expect(run(withoutSend)).rejects.toMatchObject({
      missingScopes: ["message.list.send"],
      code: "tiktokMissingScopes",
    })
  })

  // Refusing here would leave a workspace that only wants DMs unable to
  // connect at all. The missing comment scope surfaces as the re-authorize
  // warning on the settings list instead.
  test("accepts a grant missing only the comment scopes", async () => {
    const auth = await run(TIKTOK_CORE_SCOPES)

    expect(auth.metadata.scopes).toEqual([...TIKTOK_CORE_SCOPES])
    expect(auth.metadata.openId).toBe("open-1")
  })

  // The refusal has to land before anything is persisted, and the profile
  // lookup is the first call that would spend the token.
  test("does not fetch the profile when a core scope is missing", async () => {
    await expect(run(["user.info.basic"])).rejects.toThrow(
      TiktokMissingScopesError,
    )

    expect(getUserInfo).not.toHaveBeenCalled()
  })
})
