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

const {
  canReturnToAiAgent,
  findAiHandoverContactInbox,
  resolveThreadControlView,
} = await import("@/features/conversations/utils/thread-control")

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

  test("an idle Messenger thread can be passed back to AI hand-over; an idle WhatsApp thread cannot be passed", () => {
    const idleMessenger = resolveThreadControlView(
      {
        contactInboxes: [
          inbox("ci-ms", "messenger", { threadControlState: "idle" }),
        ],
      },
      NOW,
      "messenger",
    )
    expect(idleMessenger).toMatchObject({ state: "idle", canPass: true })

    const idleWhatsapp = resolveThreadControlView(
      {
        contactInboxes: [
          inbox("ci-wa", "whatsapp", { threadControlState: "idle" }),
        ],
      },
      NOW,
      "whatsapp",
    )
    expect(idleWhatsapp).toMatchObject({ state: "idle", canPass: false })
  })

  test("a standby Messenger thread (AI hand-over owns it) cannot be passed", () => {
    const view = resolveThreadControlView(
      { contactInboxes: [inbox("ci-ms", "messenger")] },
      NOW,
      "messenger",
    )
    expect(view).toMatchObject({ state: "standby", canPass: false })
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

describe("header return-to-AI resolution (findAiHandoverContactInbox + canReturnToAiAgent)", () => {
  const unobserved = {
    threadControlState: null,
    threadOwnerRole: null,
    threadControlUpdatedAt: null,
  }
  /** What the header button does: scope to the AI inbox, resolve its own view. */
  const resolve = (contactInboxes: ReturnType<typeof inbox>[]) => {
    const aiInbox = findAiHandoverContactInbox({ contactInboxes })
    if (!aiInbox) {
      return null
    }
    const view = resolveThreadControlView({ contactInboxes: [aiInbox] }, NOW)
    return canReturnToAiAgent(aiInbox, view) ? aiInbox.id : null
  }

  test("a Messenger thread whose routing was never observed is ours: offered (as v1 does)", () => {
    expect(resolve([inbox("ci-ms", "messenger", unobserved)])).toBe("ci-ms")
  })

  test("a WhatsApp thread is never offered (it passes to an escalation partner)", () => {
    expect(resolve([inbox("ci-wa", "whatsapp", unobserved)])).toBeNull()
    expect(
      resolve([inbox("ci-wa", "whatsapp", { threadControlState: "owned" })]),
    ).toBeNull()
  })

  test("owned and idle Messenger threads are offered", () => {
    expect(
      resolve([inbox("ci-ms", "messenger", { threadControlState: "owned" })]),
    ).toBe("ci-ms")
    expect(
      resolve([inbox("ci-ms", "messenger", { threadControlState: "idle" })]),
    ).toBe("ci-ms")
  })

  test("a thread the AI already owns (standby) is not offered", () => {
    expect(resolve([inbox("ci-ms", "messenger")])).toBeNull()
  })

  test("no routing-capable inbox at all is not offered", () => {
    expect(resolve([inbox("ci-ig", "instagram", unobserved)])).toBeNull()
  })

  test.each([
    [
      "owned",
      { threadControlState: "owned", threadOwnerRole: "customer_service" },
    ],
    ["standby", { threadControlState: "standby" }],
    ["idle", { threadControlState: "idle" }],
    ["unobserved", unobserved],
  ])("an observed (%s) WhatsApp inbox does not hide an unobserved Messenger inbox", (_label, whatsappRouting) => {
    expect(
      resolve([
        inbox("ci-wa", "whatsapp", whatsappRouting),
        inbox("ci-ms", "messenger", unobserved),
      ]),
    ).toBe("ci-ms")
  })
})
