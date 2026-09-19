import { beforeEach, describe, expect, test, vi } from "vitest"

const post = vi.fn()
vi.mock("ky", () => ({ default: { post } }))

const {
  subscribeTiktokWebhooks,
  TIKTOK_COMMENT_EVENT_TYPE,
  TIKTOK_DIRECT_MESSAGE_EVENT_TYPE,
} = await import("../src/apis/webhook")

const CREDENTIALS = { clientId: "app-1", clientSecret: "secret" }
const CALLBACK = "https://example.com/integrations/tiktok/webhook"

const respondWith = (...codes: number[]) => {
  for (const code of codes) {
    post.mockReturnValueOnce({ json: () => Promise.resolve({ code }) })
  }
}

const eventTypesSent = () =>
  post.mock.calls.map((call) => call[1].json.event_type)

beforeEach(() => {
  post.mockReset()
})

describe("subscribeTiktokWebhooks", () => {
  test("always registers the direct-message subscription", async () => {
    respondWith(0, 0)

    await subscribeTiktokWebhooks(CREDENTIALS, CALLBACK)

    expect(eventTypesSent()[0]).toBe(TIKTOK_DIRECT_MESSAGE_EVENT_TYPE)
  })

  // A credential that cannot receive messages is worse than a refused save, so
  // this one failure is allowed to reject the whole action.
  test("propagates a failed direct-message subscription", async () => {
    respondWith(40_001)

    await expect(
      subscribeTiktokWebhooks(CREDENTIALS, CALLBACK),
    ).rejects.toThrow()
  })

  // Registering only `DIRECT_MESSAGE` is precisely why production received DMs
  // and no comments: TikTok scopes a subscription to one category at a time.
  test("registers both categories, direct message first", async () => {
    respondWith(0, 0)

    const result = await subscribeTiktokWebhooks(CREDENTIALS, CALLBACK)

    expect(eventTypesSent()).toEqual([
      TIKTOK_DIRECT_MESSAGE_EVENT_TYPE,
      TIKTOK_COMMENT_EVENT_TYPE,
    ])
    expect(result.comments).toBe(true)
  })

  // `item_list` narrows delivery to named posts and is cumulative per app —
  // sending it once means omitting it can never again mean "all posts". The
  // all-posts targeting option depends on it never being sent.
  test("never narrows delivery to an item_list", async () => {
    respondWith(0, 0)

    await subscribeTiktokWebhooks(CREDENTIALS, CALLBACK)

    for (const call of post.mock.calls) {
      expect(call[1].json).not.toHaveProperty("item_list")
    }
  })

  // The reason the comment call is separate: this failure used to take the
  // settings form down with it, which is what kept the subscription unwired.
  // It must now cost only the comment subscription.
  test("a rejected comment subscription neither throws nor hides itself", async () => {
    respondWith(0, 40_001)
    const onError = vi.fn()

    const result = await subscribeTiktokWebhooks(CREDENTIALS, CALLBACK, onError)

    expect(result.comments).toBe(false)
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
