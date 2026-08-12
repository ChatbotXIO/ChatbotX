import { HttpResponse, http, server } from "@chatbotx.io/vitest-config/msw"
import { describe, expect, test } from "vitest"
import { createCustomAudience } from "../src/apis/custom-audiences"
import { DEFAULT_API_VERSION } from "../src/constants"

const BASE = "https://graph.facebook.com"
const ACCESS_TOKEN = "ADS_TOKEN"

describe("createCustomAudience", () => {
  test("creates a user-provided customer-list custom audience and parses the id", async () => {
    let capturedBody: unknown
    let capturedToken: string | null = null

    server.use(
      http.post(
        `${BASE}/${DEFAULT_API_VERSION}/act_9/customaudiences`,
        async ({ request }) => {
          capturedToken = new URL(request.url).searchParams.get("access_token")
          capturedBody = await request.json()
          return HttpResponse.json({ id: "aud_1" })
        },
      ),
    )

    await expect(
      createCustomAudience({
        accessToken: ACCESS_TOKEN,
        adAccountId: "act_9",
        name: "CTWA buyers",
        description: "Retargeted CTWA buyers",
      }),
    ).resolves.toEqual({ id: "aud_1" })

    expect(capturedToken).toBe(ACCESS_TOKEN)
    expect(capturedBody).toEqual({
      name: "CTWA buyers",
      description: "Retargeted CTWA buyers",
      subtype: "CUSTOM",
      customer_file_source: "USER_PROVIDED_ONLY",
    })
  })

  test("rejects an invalid create response", async () => {
    server.use(
      http.post(`${BASE}/${DEFAULT_API_VERSION}/act_9/customaudiences`, () =>
        HttpResponse.json({}),
      ),
    )

    await expect(
      createCustomAudience({
        accessToken: ACCESS_TOKEN,
        adAccountId: "act_9",
        name: "CTWA buyers",
      }),
    ).rejects.toThrow()
  })
})
