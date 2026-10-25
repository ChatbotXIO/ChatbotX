import type { Context } from "@chatbotx.io/sdk"
import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { getUserDetail } from "../src/api/tag"
import { getUserProfile } from "../src/api/user"
import { ZaloException } from "../src/lib/exception"
import type { ZaloAuthValue } from "../src/schema/definition"

const ACCESS_TOKEN = "ZALO_TOKEN"
const BASE = "https://openapi.zalo.me"

const ctx = {
  auth: { tokens: { accessToken: ACCESS_TOKEN } },
} as unknown as Context<ZaloAuthValue>

const mockUserProfile = (data: Record<string, unknown>) => {
  server.use(
    http.get(`${BASE}/v3.0/oa/user/detail`, ({ request }) => {
      expect(request.headers.get("access_token")).toBe(ACCESS_TOKEN)
      return HttpResponse.json({
        error: 0,
        message: "Success",
        data: {
          user_id: "U123",
          display_name: "Ada",
          avatar: "",
          ...data,
        },
      })
    }),
  )
}

describe("getUserProfile", () => {
  test.each([
    [1, "male"],
    ["1", "male"],
    [2, "female"],
    ["2", "female"],
    [0, undefined],
    [3, undefined],
    [undefined, undefined],
  ])("normalizes user_gender %s", async (userGender, expected) => {
    mockUserProfile({ user_gender: userGender })

    await expect(getUserProfile({ ctx, psid: "U123" })).resolves.toMatchObject({
      sourceId: "U123",
      firstName: "Ada",
      gender: expected,
    })
  })
})

describe("getUserProfile Google click (dynamic_param)", () => {
  const GCLID = "EAIaIQobChMI7P_9z568iAMV1234567890"

  test("reads a gclid dynamic_param into the Google referral", async () => {
    mockUserProfile({ dynamic_param: `gclid:${GCLID}` })

    const profile = await getUserProfile({ ctx, psid: "U123" })

    expect(profile.referral).toMatchObject({
      gclid: GCLID,
      gbraid: null,
      googleCampaignId: null,
      googleAdGroupId: null,
      googleAdId: null,
    })
    expect(
      new Date(profile.referral?.googleClickReceivedAt as string).toISOString(),
    ).toBe(profile.referral?.googleClickReceivedAt)
  })

  test("reads a gbraid dynamic_param and nulls gclid", async () => {
    mockUserProfile({ dynamic_param: "gbraid:0AAAAAD_dummy_token" })

    const profile = await getUserProfile({ ctx, psid: "U123" })

    expect(profile.referral).toMatchObject({
      gclid: null,
      gbraid: "0AAAAAD_dummy_token",
    })
  })

  test("reads campaign ids when the parameter carries them", async () => {
    mockUserProfile({
      dynamic_param: `gclid:${GCLID},campaignid:1,adgroupid:2,adid:3`,
    })

    const profile = await getUserProfile({ ctx, psid: "U123" })

    expect(profile.referral).toMatchObject({
      googleCampaignId: "1",
      googleAdGroupId: "2",
      googleAdId: "3",
    })
  })

  test.each([
    ["absent", undefined],
    ["empty", ""],
    ["not a Google click", "utm_source=newsletter"],
    ["a click id that is too short", "gclid:abc"],
  ])("returns no referral when dynamic_param is %s", async (_name, value) => {
    mockUserProfile({ dynamic_param: value })

    const profile = await getUserProfile({ ctx, psid: "U123" })

    expect(profile).not.toHaveProperty("referral")
  })
})

describe("getUserProfile lookup options", () => {
  test("skips the avatar download when includeAvatar is false", async () => {
    let avatarRequests = 0
    server.use(
      http.get("https://s120-ava-talk.zadn.vn/avatar.jpg", () => {
        avatarRequests += 1
        return new HttpResponse(new Uint8Array([1]))
      }),
    )
    mockUserProfile({ avatar: "https://s120-ava-talk.zadn.vn/avatar.jpg" })

    const profile = await getUserProfile({
      ctx,
      psid: "U123",
      includeAvatar: false,
    })

    expect(profile.avatar).toBeUndefined()
    expect(avatarRequests).toBe(0)
  })

  test("fails fast once requestTimeoutMs elapses", async () => {
    let requests = 0
    server.use(
      http.get(`${BASE}/v3.0/oa/user/detail`, async () => {
        requests += 1
        await new Promise((resolve) => setTimeout(resolve, 300))
        return HttpResponse.json({ error: 0, message: "Success", data: {} })
      }),
    )

    await expect(
      getUserProfile({ ctx, psid: "U123", requestTimeoutMs: 30 }),
    ).rejects.toBeInstanceOf(ZaloException)
    expect(requests).toBe(1)
  })

  test("keeps the getUserDetail action response unchanged", async () => {
    mockUserProfile({ user_is_follower: true, dynamic_param: "gclid:x" })

    await expect(getUserDetail({ ctx, userId: "U123" })).resolves.toMatchObject(
      { user_id: "U123", display_name: "Ada", user_is_follower: true },
    )
  })
})
