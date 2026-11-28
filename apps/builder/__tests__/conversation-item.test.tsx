import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ListConversationItemResource } from "@/features/conversations/schema/resource"
import { useWhatsappVoipCallStore } from "@/features/integration-whatsapp/calling/voip/voip-call-store"

vi.mock("@/features/response-sla/provider/response-sla-hook", () => ({
  useResponseSlaEnabled: () => true,
}))
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
  useFormatter: () => ({
    dateTime: (at: Date) => at.toISOString(),
    list: (items: string[]) => items.join(", "),
  }),
  useLocale: () => "en",
}))

vi.mock("@/features/translation/hooks/use-translation-settings", () => ({
  // Translation off for the workspace: the inbox renders exactly as before.
  useTranslationSettings: () => ({ data: undefined }),
  useInvalidateTranslation: () => vi.fn(),
}))
const executeReadActionMock = vi.fn()
vi.mock("@/features/conversations/hooks/use-mark-conversation-read", () => ({
  useMarkConversationRead: () => executeReadActionMock,
}))

vi.mock("@/features/tenant/tenant-settings-provider", () => ({
  useTenantSettings: () => ({ name: "AhaChat" }),
}))

vi.mock("@/features/contacts/utils", () => ({
  useAvatarUrl: () => undefined,
}))

vi.mock("@/lib/auth/avatar", () => ({
  useUserAvatarUrl: () => undefined,
}))

const resolveCallPreviewKindMock = vi.fn<() => string | undefined>(
  () => undefined,
)
vi.mock(
  "@/features/conversations/queries/resolve-last-message-preview",
  () => ({
    resolveLastMessagePreview: () => "hello there",
    resolveCallPreviewKind: () => resolveCallPreviewKindMock(),
  }),
)

vi.mock("@/features/conversations/utils/ad-badge", () => ({
  selectAdBadge: () => null,
  selectGoogleAdsBadge: () => null,
  adBadgeLabelKey: () => "whatsapp.calls.ringingBadge",
  googleAdsBadgeLabelKey: () => "fields.adReferral.googleAds",
}))

const storeState = {
  activeConversationId: null as string | null,
  applyAgentLastReadAt: vi.fn(),
  clearManuallyUnread: vi.fn(),
}
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

const contextMock = {
  answer: vi.fn().mockResolvedValue(undefined),
  dismiss: vi.fn(),
  hangup: vi.fn().mockResolvedValue(undefined),
  toggleMute: vi.fn(),
}
const optionalCallContextMock = vi.fn<() => typeof contextMock | null>(
  () => contextMock,
)
vi.mock(
  "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context",
  () => ({
    useOptionalWhatsappVoipCallContext: () => optionalCallContextMock(),
  }),
)

const { default: ConversationItem } = await import(
  "@/features/conversations/conversation-item"
)

const makeConversation = (
  overrides: Partial<ListConversationItemResource> = {},
): ListConversationItemResource =>
  ({
    id: "conversation-1",
    workspaceId: "workspace-1",
    contact: { fullName: "Ada Lovelace" },
    contactInboxes: [],
    followed: false,
    messages: [],
    agentLastReadAt: null,
    contactLastReadAt: null,
    lastActivityAt: null,
    assignedUserId: null,
    assignedInboxTeamId: null,
    recentParticipants: [],
    ...overrides,
  }) as unknown as ListConversationItemResource

const ringingCall = {
  whatsappCallId: "call-1",
  wacid: "wacid-1",
  conversationId: "conversation-1",
  contactInboxId: "contact-inbox-1",
  contactName: "Ada Lovelace",
  offer: { sdpType: "offer" as const, sdp: "v=0 offer" },
  deadlineAt: "2026-01-01T00:00:00.000Z",
}

const ringingCall2 = {
  ...ringingCall,
  whatsappCallId: "call-2",
  conversationId: "conversation-2",
  contactName: "Grace Hopper",
}

describe("ConversationItem", () => {
  let container: HTMLDivElement
  let root: Root
  const onSelect = vi.fn()

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    resolveCallPreviewKindMock.mockReturnValue(undefined)
    useWhatsappVoipCallStore.setState({ call: null, ringingCalls: [] })
    storeState.activeConversationId = null
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = (
    conversation: ListConversationItemResource,
    assigneeOptionNameByValue = new Map<string, string>(),
    canViewEmailAndPhone = true,
  ) =>
    act(() => {
      root.render(
        <ConversationItem
          assigneeOptionNameByValue={assigneeOptionNameByValue}
          canViewEmailAndPhone={canViewEmailAndPhone}
          conversation={conversation}
          onSelect={onSelect}
        />,
      )
    })

  test("no ringing badge or Answer/Reject for a non-ringing row", async () => {
    await render(makeConversation())

    expect(container.textContent).not.toContain("whatsapp.calls.ringingBadge")
    expect(
      container.querySelector(`[aria-label="whatsapp.calls.answer"]`),
    ).toBeNull()
    expect(
      container.querySelector(`[aria-label="whatsapp.calls.reject"]`),
    ).toBeNull()
  })
  test("shows an avatar for each member who replied, named in its label", async () => {
    await render(
      makeConversation({
        recentParticipants: [
          {
            userId: "u1",
            name: "Hoàng",
            image: null,
            lastRepliedAt: new Date("2026-11-20T10:00:00Z"),
          },
          {
            userId: "u2",
            name: "Hùng",
            image: null,
            lastRepliedAt: new Date("2026-11-19T10:00:00Z"),
          },
        ],
      }),
    )

    const stack = container.querySelector(`[aria-label="joined"]`)
    expect(stack).not.toBeNull()
    expect(container.textContent).toContain("Ho")
    expect(container.textContent).toContain("Hù")
  })

  describe("contact tag chips", () => {
    const withTags = (
      names: string[],
      tagCount: number,
      color: string | null = null,
    ): ListConversationItemResource =>
      makeConversation({
        contact: {
          fullName: "Ada Lovelace",
          tagCount,
          tagPreview: names.map((name) => ({ id: `id-${name}`, name, color })),
        } as unknown as ListConversationItemResource["contact"],
      })

    test("a contact with no tags shows no chips and no overflow", async () => {
      await render(withTags([], 0))

      expect(container.textContent).not.toContain("more:")
    })

    test("a contact with a few tags shows each of them and no +N", async () => {
      await render(withTags(["alpha", "beta"], 2))

      expect(container.textContent).toContain("alpha")
      expect(container.textContent).toContain("beta")
      expect(container.textContent).not.toContain("more:")
    })

    test("a contact with many tags shows the loaded chips then a count-only +N", async () => {
      await render(withTags(["alpha", "beta", "gamma"], 12))

      expect(container.textContent).toContain("alpha")
      expect(container.textContent).toContain("gamma")
      // `more` receives the hidden count: 12 total - 3 shown.
      expect(container.textContent).toContain("more:9")
    })

    test("a colored tag paints its chip with a readable text color; an uncolored one has no inline style", async () => {
      await render(withTags(["dark"], 1, "#000000"))
      const darkChip = container.querySelector<HTMLElement>('[title="dark"]')
      expect(darkChip?.style.backgroundColor).toBe("rgb(0, 0, 0)")
      expect(darkChip?.style.color).toBe("rgb(255, 255, 255)")

      await render(withTags(["light"], 1, "#FDE68A"))
      const lightChip = container.querySelector<HTMLElement>('[title="light"]')
      expect(lightChip?.style.color).toBe("rgb(15, 23, 42)")

      await render(withTags(["plain"], 1, null))
      const plainChip = container.querySelector<HTMLElement>('[title="plain"]')
      expect(plainChip?.getAttribute("style")).toBeNull()
    })

    test("a row held from before previews existed renders without chips", async () => {
      await render(makeConversation())

      expect(container.textContent).not.toContain("more:")
    })
  })

  describe("contact phone and email icons", () => {
    const withContact = (contact: Record<string, unknown>) =>
      makeConversation({
        contact: { fullName: "Ada Lovelace", ...contact },
      } as Partial<ListConversationItemResource>)
    const phoneIcon = () =>
      container.querySelector('[aria-label="fields.phoneNumber.label"]')
    const emailIcon = () =>
      container.querySelector('[aria-label="fields.email.label"]')

    test("shows a phone icon for a contact with a saved phone number", async () => {
      await render(withContact({ phoneNumber: "+84349566551", email: null }))

      expect(phoneIcon()).not.toBeNull()
      expect(emailIcon()).toBeNull()
    })

    test("shows an email icon for a contact with a saved email", async () => {
      await render(withContact({ phoneNumber: null, email: "ada@example.com" }))

      expect(emailIcon()).not.toBeNull()
      expect(phoneIcon()).toBeNull()
    })

    test("shows both icons when the contact left both", async () => {
      await render(
        withContact({ phoneNumber: "+84349566551", email: "ada@example.com" }),
      )

      expect(phoneIcon()).not.toBeNull()
      expect(emailIcon()).not.toBeNull()
    })

    test.each([
      ["a numeric webchat guest id", "11700000000000001"],
      ["a workspace-scoped webchat guest id", "1164:6f9619ff-8b86-d011"],
      ["an empty string", ""],
    ])("shows no email icon when the stored email is %s", async (_label, email) => {
      await render(withContact({ phoneNumber: null, email }))

      expect(emailIcon()).toBeNull()
    })

    test("shows no icon for a contact with neither", async () => {
      await render(withContact({ phoneNumber: null, email: null }))

      expect(phoneIcon()).toBeNull()
      expect(emailIcon()).toBeNull()
    })

    test("shows neither icon to a member who may not see email and phone", async () => {
      await render(
        withContact({ phoneNumber: "+84349566551", email: "ada@example.com" }),
        new Map<string, string>(),
        false,
      )

      expect(phoneIcon()).toBeNull()
      expect(emailIcon()).toBeNull()
    })

    test("the value is not written into the row, only into the hover text", async () => {
      await render(
        withContact({ phoneNumber: "+84349566551", email: "ada@example.com" }),
      )

      expect(container.textContent).not.toContain("+84349566551")
      expect(container.textContent).not.toContain("ada@example.com")
    })
  })

  describe("conversation type icon", () => {
    test("a direct message shows a speech bubble, not an envelope", async () => {
      await render(makeConversation())

      expect(container.querySelector(".lucide-message-circle")).not.toBeNull()
      expect(container.querySelector(".lucide-message-square-text")).toBeNull()
      expect(container.querySelector(".lucide-mail")).toBeNull()
    })

    test("a comment shows the text-bubble icon", async () => {
      await render(
        makeConversation({
          messages: [{ type: "comment" }],
        } as unknown as Partial<ListConversationItemResource>),
      )

      expect(
        container.querySelector(".lucide-message-square-text"),
      ).not.toBeNull()
      expect(container.querySelector(".lucide-message-circle")).toBeNull()
    })
  })

  test("shows no participant avatars when nobody replied", async () => {
    await render(makeConversation({ recentParticipants: [] }))

    expect(container.querySelector(`[aria-label="joined"]`)).toBeNull()
  })

  test("uses cached assignee initials after a realtime relation reset", async () => {
    await render(
      makeConversation({
        assignedUser: null,
        assignedUserId: "user-1",
      }),
      new Map([["u_user-1", "Grace Hopper"]]),
    )

    expect(container.textContent).toContain("Gr")
  })

  test("renders no ringing overlay when calling is disabled for this workspace (optional context is null)", async () => {
    optionalCallContextMock.mockReturnValueOnce(null)
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringingCall] })
    await render(makeConversation({ id: "conversation-1" }))

    expect(container.textContent).not.toContain("whatsapp.calls.ringingBadge")
    expect(
      container.querySelector(`[aria-label="whatsapp.calls.answer"]`),
    ).toBeNull()
  })

  test("shows the ringing badge and Answer/Reject only for the matching ringing conversation", async () => {
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringingCall] })
    await render(makeConversation({ id: "conversation-1" }))

    expect(container.textContent).toContain("whatsapp.calls.ringingBadge")
    expect(
      container.querySelector(`[aria-label="whatsapp.calls.answer"]`),
    ).not.toBeNull()
    expect(
      container.querySelector(`[aria-label="whatsapp.calls.reject"]`),
    ).not.toBeNull()
  })

  test("a different (non-matching) conversation row stays unchanged while another is ringing", async () => {
    useWhatsappVoipCallStore.setState({ ringingCalls: [ringingCall] })
    await render(makeConversation({ id: "conversation-2" }))

    expect(container.textContent).not.toContain("whatsapp.calls.ringingBadge")
    expect(
      container.querySelector(`[aria-label="whatsapp.calls.answer"]`),
    ).toBeNull()
  })

  test("several rows ring simultaneously — each shows its own badge and buttons", async () => {
    useWhatsappVoipCallStore.setState({
      ringingCalls: [ringingCall, ringingCall2],
    })
    await render(makeConversation({ id: "conversation-1" }))
    expect(
      container.querySelector(`[aria-label="whatsapp.calls.answer"]`),
    ).not.toBeNull()
    act(() => root.unmount())
    container.remove()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await render(makeConversation({ id: "conversation-2" }))
    expect(
      container.querySelector(`[aria-label="whatsapp.calls.answer"]`),
    ).not.toBeNull()
  })

  test("Answer/Reject stopPropagation so the row is not selected, and pass the row's own call id to the shared context", async () => {
    useWhatsappVoipCallStore.setState({
      ringingCalls: [ringingCall, ringingCall2],
    })
    await render(makeConversation({ id: "conversation-1" }))

    const answerButton = container.querySelector<HTMLButtonElement>(
      `[aria-label="whatsapp.calls.answer"]`,
    )
    act(() => {
      answerButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(contextMock.answer).toHaveBeenCalledWith("call-1")
    expect(onSelect).not.toHaveBeenCalled()

    const rejectButton = container.querySelector<HTMLButtonElement>(
      `[aria-label="whatsapp.calls.reject"]`,
    )
    act(() => {
      rejectButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(contextMock.dismiss).toHaveBeenCalledWith("call-1")
    expect(onSelect).not.toHaveBeenCalled()
  })

  test("a different row's Answer button passes ITS OWN id, not another ringing row's", async () => {
    useWhatsappVoipCallStore.setState({
      ringingCalls: [ringingCall, ringingCall2],
    })
    await render(makeConversation({ id: "conversation-2" }))

    const answerButton = container.querySelector<HTMLButtonElement>(
      `[aria-label="whatsapp.calls.answer"]`,
    )
    act(() => {
      answerButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(contextMock.answer).toHaveBeenCalledWith("call-2")
  })

  test("clicking the row still selects the conversation as before", async () => {
    await render(makeConversation())

    const rowButton = container.querySelector("button")
    act(() => {
      rowButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  // Like Chatwoot's conversation card: a compact age ("8d", never seconds)
  // with the exact time one hover away.
  test("shows the last activity as a short age with the exact time as tooltip", async () => {
    vi.useFakeTimers({
      now: new Date("2026-01-10T00:00:00Z"),
      toFake: ["Date"],
    })
    try {
      await render(
        makeConversation({
          lastActivityAt: new Date("2026-01-02T00:00:00Z"),
        }),
      )

      const age = container.querySelector<HTMLElement>("time")
      expect(age?.textContent).toBe("messages.timeAgo.days:8")
      expect(age?.getAttribute("title")).toBe("2026-01-02T00:00:00.000Z")
      expect(age?.getAttribute("datetime")).toBe("2026-01-02T00:00:00.000Z")
    } finally {
      vi.useRealTimers()
    }
  })

  test("shows a conversation younger than a minute as now", async () => {
    vi.useFakeTimers({
      now: new Date("2026-01-10T00:00:07Z"),
      toFake: ["Date"],
    })
    try {
      await render(
        makeConversation({
          lastActivityAt: new Date("2026-01-10T00:00:00Z"),
        }),
      )

      expect(container.querySelector("time")?.textContent).toBe(
        "messages.timeAgo.now",
      )
    } finally {
      vi.useRealTimers()
    }
  })

  test("clicking an active unread row triggers the read action", async () => {
    storeState.activeConversationId = "conversation-1"
    await render(
      makeConversation({
        lastActivityAt: new Date("2026-01-02T00:00:00Z"),
        agentLastReadAt: null,
      }),
    )
    executeReadActionMock.mockClear()

    const rowButton = container.querySelector("button")
    act(() => {
      rowButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(executeReadActionMock).toHaveBeenCalledTimes(1)
  })

  // Opening is read by the thread pane; a row effect would re-read on every
  // virtualized remount and miss the mobile layout, where selecting a row
  // unmounts the list.
  test("does not read an active row on mount", async () => {
    storeState.activeConversationId = "conversation-1"
    await render(
      makeConversation({
        lastActivityAt: new Date("2026-01-02T00:00:00Z"),
        agentLastReadAt: null,
      }),
    )

    expect(executeReadActionMock).not.toHaveBeenCalled()
  })

  test("clicking the active row clears a manual-unread mark and reads it", async () => {
    storeState.activeConversationId = "conversation-1"
    await render(
      makeConversation({
        lastActivityAt: new Date("2026-01-02T00:00:00Z"),
        agentLastReadAt: null,
      }),
    )

    const rowButton = container.querySelector("button")
    act(() => {
      rowButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(storeState.clearManuallyUnread).toHaveBeenCalledWith(
      "conversation-1",
    )
    expect(executeReadActionMock).toHaveBeenCalledTimes(1)
  })

  test("clicking an inactive row does not call the read action directly", async () => {
    await render(
      makeConversation({
        lastActivityAt: new Date("2026-01-02T00:00:00Z"),
        agentLastReadAt: null,
      }),
    )

    const rowButton = container.querySelector("button")
    act(() => {
      rowButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(executeReadActionMock).not.toHaveBeenCalled()
  })

  test("renders an unread row with a bold preview and avatar ring", async () => {
    await render(
      makeConversation({
        lastActivityAt: new Date("2026-01-02T00:00:00Z"),
        agentLastReadAt: null,
      }),
    )

    const contactName = Array.from(container.querySelectorAll("span")).find(
      (element) => element.textContent === "Ada Lovelace",
    )
    expect(contactName?.classList.contains("font-semibold")).toBe(true)
    expect(contactName?.classList.contains("text-muted-foreground")).toBe(false)
    expect(container.querySelector(".border-primary")).not.toBeNull()
  })

  test("renders a read row without the unread preview and avatar styles", async () => {
    await render(
      makeConversation({
        lastActivityAt: new Date("2026-01-01T00:00:00Z"),
        agentLastReadAt: new Date("2026-01-02T00:00:00Z"),
      }),
    )

    const contactName = Array.from(container.querySelectorAll("span")).find(
      (element) => element.textContent === "Ada Lovelace",
    )
    expect(contactName?.classList.contains("font-medium")).toBe(true)
    expect(contactName?.classList.contains("text-muted-foreground")).toBe(true)
    expect(container.querySelector(".border-primary")).toBeNull()
  })

  test("no call preview icon renders for a non-call message", async () => {
    resolveCallPreviewKindMock.mockReturnValue(undefined)
    await render(makeConversation())

    expect(container.querySelector("svg.lucide-phone-incoming")).toBeNull()
    expect(container.querySelector("svg.lucide-phone-outgoing")).toBeNull()
    expect(container.querySelector("svg.lucide-phone-missed")).toBeNull()
    expect(container.querySelector("svg.lucide-phone-off")).toBeNull()
  })

  test.each([
    ["completedInbound", "svg.lucide-phone-incoming"],
    ["completedOutbound", "svg.lucide-phone-outgoing"],
    ["missedVoiceCall", "svg.lucide-phone-missed"],
    // Aligned with `whatsapp-call-card.tsx`'s
    // in-conversation card, which uses `PhoneOffIcon` for `unansweredVoiceCall`
    // (only `missedVoiceCall` gets `PhoneMissedIcon` there).
    ["unansweredVoiceCall", "svg.lucide-phone-off"],
    ["declinedVoiceCall", "svg.lucide-phone-off"],
    ["canceledVoiceCall", "svg.lucide-phone-off"],
  ] as const)("renders the %s call preview icon (%s)", async (kind, selector) => {
    resolveCallPreviewKindMock.mockReturnValue(kind)
    await render(makeConversation())

    expect(container.querySelector(selector)).not.toBeNull()
  })
})
