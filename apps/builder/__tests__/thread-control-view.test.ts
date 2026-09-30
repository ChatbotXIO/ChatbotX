import { THREAD_IDLE_AFTER_MS } from "@chatbotx.io/database/partials"
import { createTranslator } from "next-intl"
import { describe, expect, test, vi } from "vitest"
import {
  isStaleThreadControlSnapshot,
  resolveThreadControlView,
  resolveThreadOwnerLabel,
  type ThreadControlContactInbox,
} from "@/features/conversations/utils/thread-control"
import messages from "../messages/en.json"

vi.mock("@/lib/orpc/orpc", () => ({
  client: { conversationsAPI: {} },
}))
vi.mock("ky", () => ({ default: { post: vi.fn() } }))

const { createChatStore } = await import(
  "../src/features/chat/store/chat-store"
)

const NOW = new Date("2026-09-29T10:00:00.000Z")
const MINUTES_AGO = (minutes: number) =>
  new Date(NOW.getTime() - minutes * 60 * 1000)

const whatsappInbox = (
  overrides: Partial<ThreadControlContactInbox> = {},
): ThreadControlContactInbox => ({
  id: "ci-wa",
  channel: "whatsapp",
  lastIncomingMessageAt: MINUTES_AGO(5),
  threadControlState: "standby",
  threadOwnerRole: "ai_agent",
  threadControlUpdatedAt: MINUTES_AGO(5),
  ...overrides,
})

describe("resolveThreadControlView", () => {
  test("renders nothing when the conversation has no WhatsApp inbox", () => {
    const view = resolveThreadControlView(
      {
        contactInboxes: [whatsappInbox({ id: "ci-m", channel: "messenger" })],
      },
      NOW,
      "messenger",
    )
    expect(view).toBeNull()
  })

  test("renders nothing when routing was never observed (null state)", () => {
    const view = resolveThreadControlView(
      {
        contactInboxes: [
          whatsappInbox({
            threadControlState: null,
            threadOwnerRole: null,
            threadControlUpdatedAt: null,
          }),
        ],
      },
      NOW,
      "whatsapp",
    )
    expect(view).toBeNull()
  })

  test("locks the WhatsApp composer while another responder owns the thread", () => {
    const view = resolveThreadControlView(
      { contactInboxes: [whatsappInbox()] },
      NOW,
      "whatsapp",
    )
    expect(view).toMatchObject({
      contactInboxId: "ci-wa",
      state: "standby",
      ownerRole: "ai_agent",
      isLocked: true,
      canRelease: false,
      canPass: false,
    })
  })

  test("never locks a composer that sends through another channel", () => {
    const view = resolveThreadControlView(
      {
        contactInboxes: [
          whatsappInbox({ id: "ci-m", channel: "messenger" }),
          whatsappInbox(),
        ],
      },
      NOW,
      "messenger",
    )
    expect(view?.state).toBe("standby")
    expect(view?.isLocked).toBe(false)
  })

  test("finds the WhatsApp inbox by channel, not array position", () => {
    const view = resolveThreadControlView(
      {
        contactInboxes: [
          whatsappInbox({ id: "ci-m", channel: "messenger" }),
          whatsappInbox({ id: "ci-wa-2" }),
        ],
      },
      NOW,
    )
    expect(view?.contactInboxId).toBe("ci-wa-2")
  })

  test("offers Release and Pass while this app owns the thread", () => {
    const view = resolveThreadControlView(
      {
        contactInboxes: [
          whatsappInbox({
            threadControlState: "owned",
            threadOwnerRole: "customer_service",
          }),
        ],
      },
      NOW,
      "whatsapp",
    )
    expect(view).toMatchObject({
      state: "owned",
      canRelease: true,
      canPass: true,
      isLocked: false,
    })
  })

  test("hides Pass when this app is itself the escalation partner", () => {
    const view = resolveThreadControlView(
      {
        contactInboxes: [
          whatsappInbox({
            threadControlState: "owned",
            threadOwnerRole: "escalation",
          }),
        ],
      },
      NOW,
    )
    expect(view?.canRelease).toBe(true)
    expect(view?.canPass).toBe(false)
  })

  test("resolves to idle (unlocked) after 24h of silence, and reads ISO strings", () => {
    const old = new Date(NOW.getTime() - THREAD_IDLE_AFTER_MS).toISOString()
    const view = resolveThreadControlView(
      {
        contactInboxes: [
          whatsappInbox({
            lastIncomingMessageAt: new Date(old),
            threadControlUpdatedAt: old,
          }),
        ],
      },
      NOW,
      "whatsapp",
    )
    expect(view).toMatchObject({ state: "idle", isLocked: false, idleAt: null })
  })

  test("reports the idle boundary so the UI can re-render on time", () => {
    const view = resolveThreadControlView(
      { contactInboxes: [whatsappInbox()] },
      NOW,
    )
    expect(view?.idleAt).toBe(MINUTES_AGO(5).getTime() + THREAD_IDLE_AFTER_MS)
  })

  test("maps an unknown (future) owner role to null", () => {
    const view = resolveThreadControlView(
      { contactInboxes: [whatsappInbox({ threadOwnerRole: "new_role" })] },
      NOW,
    )
    expect(view?.ownerRole).toBeNull()
  })
})

describe("isStaleThreadControlSnapshot", () => {
  test("accepts anything when the store holds no timestamp", () => {
    expect(
      isStaleThreadControlSnapshot(
        { threadControlUpdatedAt: null },
        { threadControlUpdatedAt: null, threadControlLastEvent: null },
      ),
    ).toBe(false)
  })

  test("rejects an older snapshot and accepts an equal or newer one", () => {
    const stored = { threadControlUpdatedAt: MINUTES_AGO(1) }
    expect(
      isStaleThreadControlSnapshot(stored, {
        threadControlUpdatedAt: MINUTES_AGO(2).toISOString(),
        threadControlLastEvent: null,
      }),
    ).toBe(true)
    expect(
      isStaleThreadControlSnapshot(stored, {
        threadControlUpdatedAt: MINUTES_AGO(1),
        threadControlLastEvent: null,
      }),
    ).toBe(false)
    expect(
      isStaleThreadControlSnapshot(stored, {
        threadControlUpdatedAt: NOW,
        threadControlLastEvent: null,
      }),
    ).toBe(false)
  })

  test("treats a null snapshot as older than a stored transition", () => {
    expect(
      isStaleThreadControlSnapshot(
        { threadControlUpdatedAt: MINUTES_AGO(1) },
        { threadControlUpdatedAt: null, threadControlLastEvent: null },
      ),
    ).toBe(true)
  })

  describe("same-second tie: the server's precedence order decides", () => {
    const at = MINUTES_AGO(1)
    const snapshotOf = (threadControlLastEvent: string | null) => ({
      threadControlUpdatedAt: at,
      threadControlLastEvent,
    })

    test("our `taken` never overwrites Meta's `controlTaken` of the same second", () => {
      expect(
        isStaleThreadControlSnapshot(
          snapshotOf("controlTaken"),
          snapshotOf("taken"),
        ),
      ).toBe(true)
    })

    test("Meta's `controlTaken` overwrites our `taken` of the same second", () => {
      expect(
        isStaleThreadControlSnapshot(
          snapshotOf("taken"),
          snapshotOf("controlTaken"),
        ),
      ).toBe(false)
    })

    test("an exact redelivery of the same event is applied", () => {
      expect(
        isStaleThreadControlSnapshot(
          snapshotOf("controlPassed"),
          snapshotOf("controlPassed"),
        ),
      ).toBe(false)
    })

    test("without both events (older store or payload) the snapshot is applied", () => {
      expect(
        isStaleThreadControlSnapshot(
          { threadControlUpdatedAt: at },
          snapshotOf("inboundReceived"),
        ),
      ).toBe(false)
      expect(
        isStaleThreadControlSnapshot(
          snapshotOf("controlTaken"),
          snapshotOf("not-an-event"),
        ),
      ).toBe(false)
    })
  })
})

describe("chatStore.patchContactInboxThreadControl", () => {
  const seed = () => {
    const store = createChatStore()
    store.setState({
      conversations: [
        {
          id: "conv-1",
          contactInboxes: [
            whatsappInbox(),
            whatsappInbox({ id: "ci-other", threadControlState: null }),
          ],
        },
        { id: "conv-2", contactInboxes: [whatsappInbox()] },
      ] as never,
    })
    return store
  }

  const inboxOf = (
    store: ReturnType<typeof seed>,
    conversationId: string,
    contactInboxId: string,
  ) =>
    (
      store.getState().conversations as never as {
        id: string
        contactInboxes: ThreadControlContactInbox[]
      }[]
    )
      .find((conversation) => conversation.id === conversationId)
      ?.contactInboxes.find(
        (contactInbox) => contactInbox.id === contactInboxId,
      )

  test("patches only the matching contact inbox of the matching conversation", () => {
    const store = seed()
    store.getState().patchContactInboxThreadControl("conv-1", {
      contactInboxId: "ci-wa",
      threadControlState: "owned",
      threadOwnerRole: "escalation",
      threadControlUpdatedAt: NOW.toISOString(),
      threadControlLastEvent: "taken",
    })

    expect(inboxOf(store, "conv-1", "ci-wa")).toMatchObject({
      threadControlState: "owned",
      threadOwnerRole: "escalation",
      threadControlUpdatedAt: NOW,
    })
    expect(inboxOf(store, "conv-1", "ci-other")?.threadControlState).toBeNull()
    expect(inboxOf(store, "conv-2", "ci-wa")?.threadControlState).toBe(
      "standby",
    )
  })

  test("ignores a late, older snapshot so it cannot re-lock the composer", () => {
    const store = seed()
    store.getState().patchContactInboxThreadControl("conv-1", {
      contactInboxId: "ci-wa",
      threadControlState: "owned",
      threadOwnerRole: null,
      threadControlUpdatedAt: NOW,
      threadControlLastEvent: "taken",
    })
    const before = store.getState().conversations

    store.getState().patchContactInboxThreadControl("conv-1", {
      contactInboxId: "ci-wa",
      threadControlState: "standby",
      threadOwnerRole: "ai_agent",
      threadControlUpdatedAt: MINUTES_AGO(1),
      threadControlLastEvent: "controlTaken",
    })

    expect(store.getState().conversations).toBe(before)
    expect(inboxOf(store, "conv-1", "ci-wa")?.threadControlState).toBe("owned")
  })

  test("is a no-op for a conversation that is not loaded", () => {
    const store = seed()
    const before = store.getState().conversations
    store.getState().patchContactInboxThreadControl("conv-missing", {
      contactInboxId: "ci-wa",
      threadControlState: "idle",
      threadOwnerRole: null,
      threadControlUpdatedAt: NOW,
      threadControlLastEvent: "released",
    })
    expect(store.getState().conversations).toBe(before)
  })

  describe("equal-second snapshots end the same in both arrival orders", () => {
    const takenResult = {
      contactInboxId: "ci-wa",
      threadControlState: "owned" as const,
      threadOwnerRole: "escalation",
      threadControlUpdatedAt: NOW,
      threadControlLastEvent: "taken",
    }
    const controlTakenEvent = {
      contactInboxId: "ci-wa",
      threadControlState: "standby" as const,
      threadOwnerRole: "ai_agent",
      threadControlUpdatedAt: NOW.toISOString(),
      threadControlLastEvent: "controlTaken",
    }

    test("action result first, then Meta's controlTaken realtime event", () => {
      const store = seed()
      store.getState().patchContactInboxThreadControl("conv-1", takenResult)
      store
        .getState()
        .patchContactInboxThreadControl("conv-1", controlTakenEvent)

      expect(inboxOf(store, "conv-1", "ci-wa")).toMatchObject({
        threadControlState: "standby",
        threadControlLastEvent: "controlTaken",
      })
    })

    test("Meta's controlTaken realtime event first, then the action result", () => {
      const store = seed()
      store
        .getState()
        .patchContactInboxThreadControl("conv-1", controlTakenEvent)
      store.getState().patchContactInboxThreadControl("conv-1", takenResult)

      expect(inboxOf(store, "conv-1", "ci-wa")).toMatchObject({
        threadControlState: "standby",
        threadControlLastEvent: "controlTaken",
      })
    })
  })
})

describe("resolveThreadOwnerLabel", () => {
  const t = createTranslator({ locale: "en", messages })

  test.each([
    ["owned", "escalation", "you"],
    ["standby", "ai_agent", "Meta AI"],
    ["standby", "customer_service", "Partner · Customer service"],
    ["standby", null, "Partner"],
    ["idle", null, "Partner"],
  ] as const)("%s / %s → %s", (state, role, label) => {
    expect(resolveThreadOwnerLabel(t, "AhaChat", state, role)).toBe(label)
  })
})
