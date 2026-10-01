import { describe, expect, test, vi } from "vitest"

// Only WhatsApp is routing-capable today; a second routing channel is stubbed
// so the selection between two routing-capable inboxes is pinned before a
// second adapter ships.
vi.mock("@chatbotx.io/utils/channel", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@chatbotx.io/utils/channel")>()
  return {
    ...actual,
    isThreadControlChannel: (channel: string | null | undefined): boolean =>
      channel === "whatsapp" || channel === "messenger",
  }
})

vi.mock("@/lib/orpc/orpc", () => ({
  client: { conversationsAPI: {} },
}))
vi.mock("ky", () => ({ default: { post: vi.fn() } }))

const { resolveThreadControlView } = await import(
  "@/features/conversations/utils/thread-control"
)

const NOW = new Date("2026-09-29T10:00:00.000Z")
const MINUTES_AGO = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60 * 1000)

const inbox = (
  id: string,
  channel: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  channel,
  lastIncomingMessageAt: MINUTES_AGO(5),
  threadControlState: "standby" as const,
  threadOwnerRole: "ai_agent",
  threadControlUpdatedAt: MINUTES_AGO(5),
  ...overrides,
})

describe("resolveThreadControlView with two routing-capable inboxes", () => {
  const conversation = {
    contactInboxes: [
      inbox("ci-wa", "whatsapp"),
      inbox("ci-ms", "messenger", { threadControlState: "owned" }),
    ],
  }

  test("an owned Messenger thread offers Pass but not Release; WhatsApp keeps both", () => {
    const onMessenger = resolveThreadControlView(conversation, NOW, "messenger")
    expect(onMessenger).toMatchObject({ canRelease: false, canPass: true })

    const ownedWhatsapp = resolveThreadControlView(
      {
        contactInboxes: [
          inbox("ci-wa", "whatsapp", {
            threadControlState: "owned",
            threadOwnerRole: "customer_service",
          }),
        ],
      },
      NOW,
      "whatsapp",
    )
    expect(ownedWhatsapp).toMatchObject({ canRelease: true, canPass: true })
  })

  test("picks the inbox of the composer channel", () => {
    const onMessenger = resolveThreadControlView(conversation, NOW, "messenger")
    expect(onMessenger).toMatchObject({
      contactInboxId: "ci-ms",
      channel: "messenger",
      state: "owned",
      isLocked: false,
    })

    const onWhatsapp = resolveThreadControlView(conversation, NOW, "whatsapp")
    expect(onWhatsapp).toMatchObject({
      contactInboxId: "ci-wa",
      channel: "whatsapp",
      state: "standby",
      isLocked: true,
    })
  })

  test("locks only the composer channel's own thread", () => {
    const view = resolveThreadControlView(
      {
        contactInboxes: [
          inbox("ci-wa", "whatsapp"),
          inbox("ci-ms", "messenger", { threadControlState: "idle" }),
        ],
      },
      NOW,
      "messenger",
    )
    expect(view?.isLocked).toBe(false)
  })

  test("without a routing composer channel, prefers the inbox whose routing was observed", () => {
    const view = resolveThreadControlView(
      {
        contactInboxes: [
          inbox("ci-wa", "whatsapp", {
            threadControlState: null,
            threadOwnerRole: null,
            threadControlUpdatedAt: null,
          }),
          inbox("ci-ms", "messenger"),
        ],
      },
      NOW,
      "instagram",
    )
    expect(view?.contactInboxId).toBe("ci-ms")
    expect(view?.isLocked).toBe(false)
  })

  test("a composer channel with an unobserved thread yields no view rather than another channel's", () => {
    const view = resolveThreadControlView(
      {
        contactInboxes: [
          inbox("ci-wa", "whatsapp", {
            threadControlState: null,
            threadOwnerRole: null,
            threadControlUpdatedAt: null,
          }),
          inbox("ci-ms", "messenger"),
        ],
      },
      NOW,
      "whatsapp",
    )
    expect(view).toBeNull()
  })
})
