import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import {
  connectTiktokSocialAccount,
  generateTiktokPublishingAuthUrl,
  refreshTiktokPublishingToken,
} from "../src/publisher-social-account"

const settings = { clientId: "ck", clientSecret: "cs-secret" }
let respond: (url: string, body: URLSearchParams | null) => Response

beforeEach(() => {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) =>
    respond(
      url,
      typeof init.body === "string" ? new URLSearchParams(init.body) : null,
    ),
  )
})
afterEach(() => vi.unstubAllGlobals())

const tokenBody = {
  access_token: "act.new",
  expires_in: 7200,
  open_id: "open-1",
  refresh_expires_in: 15_552_000,
  refresh_token: "rft.rotated",
  scope: "user.info.basic,video.publish",
}

describe("tiktok publishing connect", () => {
  test("the authorize URL asks only for the publishing scopes", () => {
    const url = new URL(
      generateTiktokPublishingAuthUrl({
        clientId: "ck",
        redirectUrl: "https://x/cb",
        stateParams: { a: 1 },
      }),
    )
    expect(url.origin + url.pathname).toBe(
      "https://www.tiktok.com/v2/auth/authorize/",
    )
    expect(url.searchParams.get("scope")).toBe("user.info.basic,video.publish")
    expect(url.searchParams.get("client_key")).toBe("ck")
  })

  test("connect reports the granted scopes verbatim so a withheld one is named", async () => {
    respond = (url) =>
      url.endsWith("/v2/oauth/token/")
        ? Response.json(tokenBody)
        : Response.json({
            data: {
              user: {
                avatar_url: "a",
                display_name: "Nick",
                open_id: "open-1",
              },
            },
            error: { code: "ok" },
          })
    const account = await connectTiktokSocialAccount({
      callbackUrl: "https://x/cb",
      code: "c",
      settings,
    })
    expect(account.grantedScopes).toEqual(["user.info.basic", "video.publish"])
    expect(account.refreshToken).toBe("rft.rotated")
    expect(account.destinations).toHaveLength(1)
    expect(account.destinations[0]).toMatchObject({
      externalId: "open-1",
      kind: "profile",
    })
    expect(account.tokenExpiresAt).toBeInstanceOf(Date)
  })

  test("refresh returns the rotated refresh token and takes lifetimes from the response", async () => {
    let sent: URLSearchParams | null = null
    respond = (_url, body) => {
      sent = body
      return Response.json(tokenBody)
    }
    const before = Date.now()
    const tokens = await refreshTiktokPublishingToken(settings, "rft.old")
    expect(sent).not.toBeNull()
    expect((sent as unknown as URLSearchParams).get("grant_type")).toBe(
      "refresh_token",
    )
    expect((sent as unknown as URLSearchParams).get("refresh_token")).toBe(
      "rft.old",
    )
    expect(tokens.refreshToken).toBe("rft.rotated")
    expect(tokens.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + 7_200_000 - 1000,
    )
  })

  test("a rejected refresh token is an auth failure, a server error is not", async () => {
    respond = () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
    const rejected = await refreshTiktokPublishingToken(settings, "x").catch(
      (e: unknown) => e,
    )
    expect(rejected).toBeInstanceOf(ChannelError)
    expect((rejected as ChannelError).category).toBe(
      ChannelErrorCategory.AUTH_FAILED,
    )
    expect((rejected as ChannelError).message).not.toContain("cs-secret")

    respond = () => new Response("", { status: 503 })
    const outage = await refreshTiktokPublishingToken(settings, "x").catch(
      (e: unknown) => e,
    )
    expect((outage as ChannelError).category).toBe(
      ChannelErrorCategory.NETWORK_ERROR,
    )
  })
})
