import type { Context, HandleRequestProps } from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test, vi } from "vitest"
import { getUserProfile } from "../src/api/user"
import { receiveMessage } from "../src/handlers/message/incoming-message"
import { webhookHandler } from "../src/handlers/webhook"
import type { ZaloAuthValue, ZaloConfig } from "../src/schema/definition"

// Google's Click-to-Zalo partner document, step 1 and step 2, copied as sent.

// 3.A: incoming `user_send_text` webhook. It carries no dynamic_param.
const USER_SEND_TEXT_WEBHOOK = {
  app_id: "7203948572039485",
  sender: { id: "4572947693969771653" },
  recipient: { id: "3461485453960411318" },
  event_name: "user_send_text",
  message: {
    msg_id: "3948572039485",
    text: "Hi, how can we help you today",
  },
  timestamp: "1790914314000",
}

// 3.B: `GET /v3.0/oa/user/detail` response shape (gclid and gbraid cases are
// covered by get-user-profile.test.ts).
const userDetailResponse = (dynamicParam: string) => ({
  data: {
    user_id: "4572947693969771653",
    user_id_by_app: "2839485720394857203",
    display_name: "Nguyen Van A",
    user_is_follower: false,
    dynamic_param: dynamicParam,
  },
  error: 0,
  message: "Success",
})

const ctx = {
  auth: { tokens: { accessToken: "oa-token" } },
} as unknown as Context<ZaloAuthValue>

const mockUserDetail = (dynamicParam: string) =>
  server.use(
    http.get("https://openapi.zalo.me/v3.0/oa/user/detail", ({ request }) => {
      const data = JSON.parse(
        new URL(request.url).searchParams.get("data") ?? "{}",
      )
      expect(data).toEqual({ user_id: "4572947693969771653" })
      expect(request.headers.get("access_token")).toBe("oa-token")
      return HttpResponse.json(userDetailResponse(dynamicParam))
    }),
  )

describe("Zalo Google click: Google's partner samples", () => {
  test("step 1: the user_send_text webhook is queued for the OA and carries no click", async () => {
    const queueAdd = vi.fn()

    await webhookHandler({
      config: {
        clientId: USER_SEND_TEXT_WEBHOOK.app_id,
      } as unknown as ZaloConfig,
      req: new Request("https://example.com/webhook", {
        method: "POST",
        body: JSON.stringify(USER_SEND_TEXT_WEBHOOK),
        headers: { "Content-Type": "application/json" },
      }),
      queue: { add: queueAdd },
    } as unknown as HandleRequestProps<ZaloConfig>)

    expect(queueAdd).toHaveBeenCalledWith(
      "incomingMessage",
      expect.objectContaining({
        data: expect.objectContaining({
          integrationType: "zalo",
          integrationIdentifier: "3461485453960411318",
        }),
      }),
    )
    const result = await receiveMessage({
      ctx,
      data: {
        integrationType: "zalo",
        integrationIdentifier: "3461485453960411318",
        payload: USER_SEND_TEXT_WEBHOOK,
      },
    } as never)
    expect(result?.contact.sourceId).toBe("4572947693969771653")
    expect(result?.message.text).toBe("Hi, how can we help you today")
    expect(result).not.toHaveProperty("referral")
  })

  test("the static test URLs' ids (the full A-Za-z_- alphabet, gclid and gbraid) are accepted", async () => {
    const id = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-"
    mockUserDetail(`gclid:${id}`)
    expect(
      (
        await getUserProfile({
          ctx,
          psid: "4572947693969771653",
          includeAvatar: false,
        })
      ).referral,
    ).toMatchObject({ gclid: id })

    mockUserDetail(`gbraid:${id}`)
    expect(
      (
        await getUserProfile({
          ctx,
          psid: "4572947693969771653",
          includeAvatar: false,
        })
      ).referral,
    ).toMatchObject({ gbraid: id })
  })
})
