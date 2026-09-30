import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@chatbotx.io/business", () => ({
  integrationWhatsappService: { findAllForTokenRefresh: vi.fn() },
}))
vi.mock("@chatbotx.io/integration-whatsapp/api/webhook", () => ({
  subscribeWebhook: vi.fn(),
}))
vi.mock("../src/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const { resubscribeWhatsappWebhookFields } = await import(
  "../scripts/resubscribe-whatsapp-webhook-fields"
)
type Integration =
  import("../scripts/resubscribe-whatsapp-webhook-fields").BackfillIntegration

const row = (
  id: number,
  overrides: Partial<Integration> = {},
): Integration => ({
  id: `int-${id}`,
  workspaceId: "ws-1",
  wabaId: `waba-${id}`,
  auth: {
    clientId: "platform-app",
    metadata: { wabaId: `waba-${id}` },
  } as Integration["auth"],
  ...overrides,
})

const manualAuth = (wabaId: string, clientId: string) =>
  ({
    clientId,
    metadata: { wabaId, isManual: true },
  }) as Integration["auth"]

describe("resubscribeWhatsappWebhookFields", () => {
  const subscribe = vi.fn()

  beforeEach(() => {
    subscribe.mockReset().mockResolvedValue(undefined)
  })

  const run = (rows: Integration[]) =>
    resubscribeWhatsappWebhookFields({
      listIntegrations: () => Promise.resolve(rows),
      subscribe,
    })

  it("subscribes each WABA with reconnect's field set first", async () => {
    const summary = await run([row(1), row(2)])

    expect(summary).toMatchObject({ total: 2, subscribed: 2, failed: 0 })
    expect(subscribe).toHaveBeenCalledTimes(2)
    for (const [input] of subscribe.mock.calls) {
      expect(input.includeAutomaticEvents).toBe(true)
    }
  })

  it("falls back to base + routing when the full set is rejected", async () => {
    subscribe.mockRejectedValueOnce(new Error("(#100) invalid field"))

    const summary = await run([row(1)])

    expect(
      subscribe.mock.calls.map(([input]) => input.includeAutomaticEvents),
    ).toEqual([true, false])
    expect(summary).toMatchObject({
      subscribed: 0,
      subscribedWithFallback: 1,
      failed: 0,
    })
  })

  it("logs a per-row failure and continues with the remaining rows", async () => {
    subscribe.mockImplementation(({ auth }) =>
      auth.metadata.wabaId === "waba-2"
        ? Promise.reject(new Error("token revoked"))
        : Promise.resolve(),
    )

    const summary = await run([row(1), row(2), row(3)])

    expect(summary).toMatchObject({ total: 3, subscribed: 2, failed: 1 })
    // waba-2 is tried with both sets; the others once.
    expect(subscribe).toHaveBeenCalledTimes(4)
  })

  it("subscribes once per WABA even when several numbers share it", async () => {
    const summary = await run([
      row(1),
      row(2, { id: "int-2b", wabaId: "waba-1" }),
    ])

    expect(summary.total).toBe(1)
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it("re-subscribes manual integrations with their stored callback override", async () => {
    const manual = row(9, {
      auth: {
        metadata: {
          wabaId: "waba-9",
          isManual: true,
          webhookUrl: "https://example.test/integrations/whatsapp/webhook/9",
        },
        verifyToken: "verify-9",
      } as Integration["auth"],
    })

    const summary = await run([manual, row(1)])

    expect(summary).toMatchObject({ total: 2, manual: 1, subscribed: 2 })
    const overrideByWaba = Object.fromEntries(
      subscribe.mock.calls.map(([input]) => [
        input.auth.metadata.wabaId,
        input.overrideCallbackUrl,
      ]),
    )
    expect(overrideByWaba).toEqual({ "waba-9": true, "waba-1": false })
    // The manual row keeps its own auth (the customer's app and token).
    expect(subscribe.mock.calls[0]?.[0].auth).toBe(manual.auth)
  })

  it("keeps the override on the base-set fallback for a manual integration", async () => {
    subscribe.mockRejectedValueOnce(new Error("(#100) invalid field"))
    const manual = row(9, {
      auth: {
        metadata: { wabaId: "waba-9", isManual: true },
      } as Integration["auth"],
    })

    await run([manual])

    expect(
      subscribe.mock.calls.map(([input]) => [
        input.includeAutomaticEvents,
        input.overrideCallbackUrl,
      ]),
    ).toEqual([
      [true, true],
      [false, true],
    ])
  })

  it("never collapses a manual and a platform integration on the same WABA", async () => {
    const summary = await run([
      row(1),
      row(2, { wabaId: "waba-1", auth: manualAuth("waba-1", "customer-app") }),
    ])

    expect(summary).toMatchObject({ total: 2, manual: 1 })
    expect(subscribe).toHaveBeenCalledTimes(2)
  })

  it("keeps two manual integrations with different app ids on the same WABA separate", async () => {
    const summary = await run([
      row(1, { wabaId: "waba-1", auth: manualAuth("waba-1", "app-a") }),
      row(2, { wabaId: "waba-1", auth: manualAuth("waba-1", "app-b") }),
    ])

    expect(summary.total).toBe(2)
    expect(subscribe).toHaveBeenCalledTimes(2)
  })

  it("collapses the same WABA and app across workspaces into one call", async () => {
    const summary = await run([
      row(1, { workspaceId: "ws-1" }),
      row(2, { id: "int-2", workspaceId: "ws-2", wabaId: "waba-1" }),
    ])

    expect(summary.total).toBe(1)
    expect(subscribe).toHaveBeenCalledTimes(1)
  })

  it("never collapses rows whose app id is unknown", async () => {
    const summary = await run([
      row(1, { auth: manualAuth("waba-1", "") }),
      row(2, { wabaId: "waba-1", auth: manualAuth("waba-1", "") }),
    ])

    expect(summary.total).toBe(2)
  })

  it("processes more than one batch of 50", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => row(i))

    const summary = await run(rows)

    expect(summary).toMatchObject({ total: 120, subscribed: 120 })
    expect(subscribe).toHaveBeenCalledTimes(120)
  })
})
