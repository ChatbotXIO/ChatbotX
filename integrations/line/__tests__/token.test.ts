import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  test,
  vi,
} from "vitest"
import { issueAccessToken } from "../src/apis/token"

const server = setupServer()
beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
afterEach(() => {
  server.resetHandlers()
  vi.useRealTimers()
})
afterAll(() => server.close())

describe("issueAccessToken", () => {
  test("posts client credentials form and computes expiresAt", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
    const seen: Record<string, string> = {}
    server.use(
      http.post(
        "https://api.line.me/v2/oauth/accessToken",
        async ({ request }) => {
          new URLSearchParams(await request.text()).forEach((v, k) => {
            seen[k] = v
          })
          return HttpResponse.json({
            access_token: "tok",
            expires_in: 3600,
            token_type: "Bearer",
          })
        },
      ),
    )

    const result = await issueAccessToken({
      channelId: "123",
      channelSecret: "sec",
    })

    expect(seen).toEqual({
      grant_type: "client_credentials",
      client_id: "123",
      client_secret: "sec",
    })
    expect(result).toEqual({
      accessToken: "tok",
      expiresAt: new Date("2026-01-01T01:00:00.000Z").toISOString(),
    })
  })

  test("throws on invalid_client", async () => {
    server.use(
      http.post("https://api.line.me/v2/oauth/accessToken", () =>
        HttpResponse.json(
          { error: "invalid_client", error_description: "invalid clientId" },
          { status: 400 },
        ),
      ),
    )
    await expect(
      issueAccessToken({ channelId: "1", channelSecret: "bad" }),
    ).rejects.toMatchObject({
      httpStatusCode: 400,
      message: "invalid clientId",
    })
  })
})
