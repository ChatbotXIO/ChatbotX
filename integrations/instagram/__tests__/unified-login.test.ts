import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import {
  exchangeUnifiedCodeForToken,
  generateUnifiedAuthUrl,
  getUnifiedInstagramAccounts,
} from "../src/apis/auth"
import { sendMessage } from "../src/apis/message"
import { subscribePageToInstagramWebhook } from "../src/apis/page"
import type { InstagramAuthValue } from "../src/schema"

const GRAPH_URL = "https://graph.facebook.com"
const VERSION = "v27.0"
const ACCESS_TOKEN = "business-integration-system-user-token"

const unifiedAuth = {
  authType: "oauth2",
  clientId: "meta-app-id",
  clientSecret: "meta-app-secret",
  redirectUrl: "https://chatbotx.example/integrations/instagram/callback",
  tokens: { accessToken: ACCESS_TOKEN },
  metadata: {
    igId: "instagram-professional-account-id",
    igName: "Example Account",
    pageId: "instagram-professional-account-id",
    version: VERSION,
    loginType: "unified",
  },
} satisfies InstagramAuthValue

describe("Instagram Unified Login", () => {
  test("builds Meta's Facebook Login for Business dialog URL", () => {
    const url = new URL(
      generateUnifiedAuthUrl({
        clientId: "1466909638750744",
        configId: "2231093364150040",
        redirectUrl:
          "https://chatbotx.herochamber.com/integrations/instagram/callback",
        state: "opaque-state",
      }),
    )

    expect(`${url.origin}${url.pathname}`).toBe(
      "https://www.facebook.com/dialog/oauth",
    )
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "1466909638750744",
      config_id: "2231093364150040",
      response_type: "code",
      override_default_response_type: "true",
      state: "opaque-state",
    })
    expect(url.searchParams.has("scope")).toBe(false)
  })

  test("exchanges the code for a BISU token and resolves the client business", async () => {
    server.use(
      http.get(`${GRAPH_URL}/${VERSION}/oauth/access_token`, ({ request }) => {
        const params = new URL(request.url).searchParams
        expect(params.get("client_id")).toBe("meta-app-id")
        expect(params.get("client_secret")).toBe("meta-app-secret")
        expect(params.get("code")).toBe("authorization-code")
        expect(params.get("redirect_uri")).toBe(
          "https://chatbotx.example/integrations/instagram/callback",
        )
        return HttpResponse.json({ access_token: ACCESS_TOKEN })
      }),
      http.get(`${GRAPH_URL}/${VERSION}/me`, ({ request }) => {
        expect(new URL(request.url).searchParams.get("fields")).toBe(
          "client_business_id",
        )
        return HttpResponse.json({ client_business_id: "business-id" })
      }),
    )

    await expect(
      exchangeUnifiedCodeForToken(
        {
          clientId: "meta-app-id",
          clientSecret: "meta-app-secret",
          version: VERSION,
        },
        "authorization-code",
        "https://chatbotx.example/integrations/instagram/callback",
      ),
    ).resolves.toEqual({
      accessToken: ACCESS_TOKEN,
      clientBusinessId: "business-id",
    })
  })

  test("maps every assigned Instagram account to a selectable candidate", async () => {
    server.use(
      http.get(
        `${GRAPH_URL}/${VERSION}/me/assigned_instagram_accounts`,
        ({ request }) => {
          const params = new URL(request.url).searchParams
          expect(params.get("fields")).toBe("id,username")
          if (params.get("after") === "page-2") {
            return HttpResponse.json({
              data: [{ id: "ig-2", username: "second" }],
            })
          }
          return HttpResponse.json({
            data: [{ id: "ig-1", username: "first.account" }],
            paging: {
              cursors: { after: "page-2" },
              next: "https://graph.facebook.com/next",
            },
          })
        },
      ),
    )

    await expect(
      getUnifiedInstagramAccounts(ACCESS_TOKEN, VERSION),
    ).resolves.toEqual([
      expect.objectContaining({ id: "ig-1", userId: "ig-1" }),
      expect.objectContaining({ id: "ig-2", userId: "ig-2" }),
    ])
  })

  test("uses graph.facebook.com and the explicit account id for messages", async () => {
    server.use(
      http.post(
        `${GRAPH_URL}/${VERSION}/instagram-professional-account-id/messages`,
        () => HttpResponse.json({ message_id: "message-id" }),
      ),
    )

    await expect(
      sendMessage(unifiedAuth, {
        recipient: { id: "igsid" },
        message: { text: "Hello" },
      }),
    ).resolves.toEqual({ message_id: "message-id" })
  })

  test("subscribes the selected account with Unified-compatible fields", async () => {
    server.use(
      http.post(
        `${GRAPH_URL}/${VERSION}/instagram-professional-account-id/subscribed_apps`,
        ({ request }) => {
          const fields = new URL(request.url).searchParams.get(
            "subscribed_fields",
          )
          expect(fields).toContain("messages")
          expect(fields).toContain("message_reactions")
          expect(fields).not.toContain("messaging_optins")
          return HttpResponse.json({ success: true })
        },
      ),
    )

    await expect(
      subscribePageToInstagramWebhook({
        igId: unifiedAuth.metadata.igId,
        accessToken: ACCESS_TOKEN,
        version: VERSION,
        loginType: "unified",
      }),
    ).resolves.toBeUndefined()
  })
})
