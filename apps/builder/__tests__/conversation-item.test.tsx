import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ListConversationItemResource } from "@/features/conversations/schema/resource"
import { useWhatsappVoipCallStore } from "@/features/integration-whatsapp/calling/voip/voip-call-store"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ execute: vi.fn() }),
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
  adBadgeLabelKey: () => "whatsapp.calls.ringingBadge",
}))

vi.mock("@/features/conversations/actions/read-conversation.action", () => ({
  readConversationAction: vi.fn(),
}))

const storeState = {
  activeConversationId: null as string | null,
  readConversation: vi.fn(),
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

  const render = (conversation: ListConversationItemResource) =>
    act(() => {
      root.render(
        <ConversationItem conversation={conversation} onSelect={onSelect} />,
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
