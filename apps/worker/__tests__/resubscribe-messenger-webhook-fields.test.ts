import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  messengerIntegrationService: { listConnectedForWebhookSubscription: vi.fn() },
}))
vi.mock("@chatbotx.io/integration-messenger/apis/page", () => ({
  subscribePageToAppWebhook: vi.fn(),
  getPageSubscribedFields: vi.fn(),
  PAGE_SUBSCRIBE_SCOPES: ["messages", "standby", "messaging_handovers"],
  LEAD_ADS_PAGE_SUBSCRIBE_FIELDS: [
    "messages",
    "standby",
    "messaging_handovers",
    "leadgen",
  ],
  ROUTING_PAGE_SUBSCRIBE_FIELDS: ["messaging_handovers", "standby"],
}))
vi.mock("../src/lib/logger", () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: vi.fn(),
    error: mocks.loggerError,
  },
}))

const { resubscribeMessengerWebhookFields } = await import(
  "../scripts/resubscribe-messenger-webhook-fields"
)
type Integration =
  import("../scripts/resubscribe-messenger-webhook-fields").BackfillIntegration

const row = (id: number): Integration => ({
  id: String(id),
  workspaceId: "ws-1",
  pageId: `page-${id}`,
  auth: {
    clientId: "app-1",
    tokens: { accessToken: `token-${id}` },
    metadata: { pageId: `page-${id}`, pageName: "P", version: "v23.0" },
  } as Integration["auth"],
})

describe("resubscribeMessengerWebhookFields", () => {
  const subscribe = vi.fn()
  const getSubscribedFields = vi.fn()

  beforeEach(() => {
    subscribe.mockReset().mockResolvedValue(undefined)
    getSubscribedFields.mockReset().mockResolvedValue(["messages"])
    mocks.loggerError.mockReset()
  })

  /** Serves `rows` through the keyset contract (ascending id, after cursor). */
  const run = (rows: Integration[]) => {
    const listPage = vi.fn(
      ({ afterId, limit }: { afterId?: string; limit: number }) =>
        Promise.resolve(
          rows
            .filter(
              (r) => afterId === undefined || Number(r.id) > Number(afterId),
            )
            .slice(0, limit),
        ),
    )
    return {
      listPage,
      result: resubscribeMessengerWebhookFields({
        listPage,
        subscribe,
        getSubscribedFields,
      }),
    }
  }

  it("re-subscribes every connected Page with its own token and version", async () => {
    const { result } = run([row(1), row(2)])

    await expect(result).resolves.toEqual({
      total: 2,
      subscribed: 2,
      failed: 0,
    })
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page-1",
        accessToken: "token-1",
        version: "v23.0",
      }),
    )
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        pageId: "page-2",
        accessToken: "token-2",
        version: "v23.0",
      }),
    )
    expect(getSubscribedFields).toHaveBeenCalledWith({
      accessToken: "token-1",
      version: "v23.0",
      appId: "app-1",
    })
  })

  it("keeps leadgen and adds the routing fields (the union is what is POSTed)", async () => {
    getSubscribedFields.mockResolvedValue(["messages", "leadgen"])

    await run([row(1)]).result

    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        subscribedFields: "messages,leadgen,messaging_handovers,standby",
      }),
    )
  })

  it("does not duplicate routing fields a Page already has", async () => {
    getSubscribedFields.mockResolvedValue(["standby", "leadgen"])

    await run([row(1)]).result

    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        subscribedFields: "standby,leadgen,messaging_handovers",
      }),
    )
  })

  it("uses the base set when the app has no current subscription", async () => {
    getSubscribedFields.mockResolvedValue([])

    await run([row(1)]).result

    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        subscribedFields: "messages,standby,messaging_handovers",
      }),
    )
  })

  it("falls back to the leadgen-inclusive scope and logs err when the read fails", async () => {
    const boom = new Error("graph down")
    getSubscribedFields.mockRejectedValue(boom)

    await expect(run([row(1)]).result).resolves.toMatchObject({
      subscribed: 1,
      failed: 0,
    })

    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        subscribedFields: "messages,standby,messaging_handovers,leadgen",
      }),
    )
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: boom, pageId: "page-1" }),
      expect.any(String),
    )
  })

  it("logs a failing Page with err and still runs the rest", async () => {
    const boom = new Error("token revoked")
    subscribe.mockImplementation(({ pageId }: { pageId: string }) =>
      pageId === "page-2" ? Promise.reject(boom) : Promise.resolve(),
    )

    const { result } = run([row(1), row(2), row(3)])

    await expect(result).resolves.toEqual({
      total: 3,
      subscribed: 2,
      failed: 1,
    })
    expect(subscribe).toHaveBeenCalledTimes(3)
    expect(mocks.loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ err: boom, pageId: "page-2" }),
      expect.any(String),
    )
  })

  it("pages through more rows than one page holds, with a bounded limit", async () => {
    const rows = Array.from({ length: 450 }, (_, i) => row(i + 1))

    const { listPage, result } = run(rows)

    await expect(result).resolves.toMatchObject({ total: 450, subscribed: 450 })
    expect(subscribe).toHaveBeenCalledTimes(450)
    for (const [input] of listPage.mock.calls) {
      expect(input.limit).toBe(200)
    }
    expect(listPage.mock.calls[1]?.[0].afterId).toBe("200")
  })

  it("keeps in-flight calls small", async () => {
    let inFlight = 0
    let peak = 0
    subscribe.mockImplementation(async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight -= 1
    })

    const { result } = run(Array.from({ length: 30 }, (_, i) => row(i + 1)))
    await result

    expect(peak).toBeLessThanOrEqual(5)
  })

  it("is idempotent: a re-run repeats the same calls and reaches the same summary", async () => {
    const rows = [row(1), row(2)]

    const first = await run(rows).result
    const second = await run(rows).result

    expect(second).toEqual(first)
    expect(subscribe).toHaveBeenCalledTimes(4)
  })

  it("does nothing when no Page is connected", async () => {
    const { result } = run([])

    await expect(result).resolves.toEqual({
      total: 0,
      subscribed: 0,
      failed: 0,
    })
    expect(subscribe).not.toHaveBeenCalled()
  })
})
