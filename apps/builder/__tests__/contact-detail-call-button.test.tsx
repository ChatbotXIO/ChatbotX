import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { GetContactResponse } from "@/features/contacts/schema/query"

/**
 * Tests the contact panel's call control (0/1/n WhatsApp numbers). Every
 * unrelated dependency of `ContactDetail` (custom fields, timezone, avatar)
 * is stubbed so these tests stay focused on that one control.
 */

// A STABLE function reference — `ContactDetail`'s field-building effect
// depends on `t` itself, so a mock that returns a NEW function identity on
// every call (a naive `() => (key) => key`) makes that dependency array
// change every render, looping `setContactFields` forever.
const translate = (key: string) => key
vi.mock("next-intl", () => ({
  useTranslations: () => translate,
}))

const toastErrorMock = vi.fn()
vi.mock("sonner", () => ({
  toast: { error: toastErrorMock, success: vi.fn() },
}))

vi.mock("@/hooks/routing", () => ({
  useWorkspaceId: () => "ws-1",
}))

type MockContactInbox = {
  id: string
  inboxId: string
  channel: string
  inbox: { name: string }
}
type MockConversation = {
  id: string
  contactInboxes: MockContactInbox[]
}

const chatStoreState: { conversations: MockConversation[] } = {
  conversations: [],
}
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: (selector: (state: typeof chatStoreState) => unknown) =>
    selector(chatStoreState),
}))

const outboundCallModeMock = {
  data: undefined as unknown,
  isError: false,
  error: null as unknown,
}
vi.mock(
  "@/features/integration-whatsapp/calling/voip/use-outbound-call-mode",
  () => ({
    useOutboundCallMode: (
      _workspaceId: string | undefined,
      _conversationId: string | undefined,
      _contactInboxId: string | undefined,
      _options?: { enabled?: boolean },
    ) => outboundCallModeMock,
  }),
)

// `ContactPanelCallEntry` reads this directly (to gate the mode query) in
// addition to `callStarterMock.voipCallContext` — kept in sync with it in
// `beforeEach` / the "hidden entirely" test below.
const voipCallContextMock = { current: {} as unknown }
vi.mock(
  "@/features/integration-whatsapp/calling/voip/whatsapp-voip-call-context",
  () => ({
    useOptionalWhatsappVoipCallContext: () => voipCallContextMock.current,
  }),
)

const requestCallPermissionDialogMock = vi.fn(
  (props: { children: React.ReactNode }) => props.children,
)
vi.mock(
  "@/features/integration-whatsapp/calling/request-call-permission-dialog",
  () => ({
    RequestCallPermissionDialog: (props: {
      children: React.ReactNode
      inboxId?: string
    }) => requestCallPermissionDialogMock(props),
  }),
)

const callStarterMock = {
  voipCallContext: {} as unknown,
  isResolvingMode: false,
  isVoipMode: true,
  canDialDirectly: true,
  isDialing: false,
  handleClick: vi.fn(),
  dialogs: null,
}
const useWhatsappCallStarterMock = vi.fn((_params: unknown) => callStarterMock)
vi.mock(
  "@/features/integration-whatsapp/calling/voip/use-whatsapp-call-starter",
  () => ({
    useWhatsappCallStarter: (params: unknown) =>
      useWhatsappCallStarterMock(params),
  }),
)

vi.mock("@/features/contacts/utils", () => ({
  useAvatarUrl: () => undefined,
}))

vi.mock("@/features/contact-filter/lib/timezone", () => ({
  getBrowserTimezone: () => "UTC",
}))

vi.mock("@/features/custom-fields/contact-custom-field-manage", () => ({
  ContactCustomFieldManage: () => null,
}))

vi.mock("@/features/contacts/edit-contact-field", () => ({
  EditContactField: () => null,
}))

// A STABLE object/array — see the `next-intl` mock's comment above for why:
// `ContactDetail`'s effect depends on `customFieldMap`, itself derived from
// `customFields` via `useMemo`, so a fresh `[]` on every call loops the same
// way a fresh `t` does.
const stableCustomFieldState = {
  customFields: [] as unknown[],
  initialized: true,
}
vi.mock("@/features/custom-fields/provider/custom-field-store-context", () => ({
  useCustomFieldStore: (
    selector: (state: typeof stableCustomFieldState) => unknown,
  ) => selector(stableCustomFieldState),
}))

const { ContactDetail } = await import("@/features/contacts/contact-detail")

const whatsappInbox = (
  id: string,
  inboxName: string,
  inboxId = `${id}-inbox`,
): MockContactInbox => ({
  id,
  inboxId,
  channel: "whatsapp",
  inbox: { name: inboxName },
})

const baseContact = {
  id: "contact-1",
  workspaceId: "ws-1",
  firstName: "Ada",
  lastName: "Lovelace",
  fullName: "Ada Lovelace",
  email: null,
  phoneNumber: null,
  gender: null,
  timezone: null,
  customFields: [],
  tags: [],
  contactNotes: [],
  contactsOnSequences: [],
} as unknown as GetContactResponse

let container: HTMLDivElement | null = null
let root: Root | null = null

function renderComponent(ui: React.ReactElement) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root?.render(ui)
  })
  return container
}

// Reuses the CURRENT root (unlike `renderComponent`, which always mounts a
// fresh one) so `ContactDetail`'s own `useState` survives the update — needed
// to prove the picker's `callSelection` resets in response to a PROP change
// rather than surviving a full remount, which would prove nothing.
function rerenderComponent(ui: React.ReactElement) {
  act(() => {
    root?.render(ui)
  })
  return container as HTMLDivElement
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount()
    })
  }
  container?.remove()
  container = null
  root = null
})

describe("ContactDetail — call control", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    chatStoreState.conversations = []
    outboundCallModeMock.data = undefined
    outboundCallModeMock.isError = false
    outboundCallModeMock.error = null
    callStarterMock.voipCallContext = {}
    callStarterMock.isResolvingMode = false
    callStarterMock.isVoipMode = true
    callStarterMock.canDialDirectly = true
    callStarterMock.isDialing = false
    callStarterMock.handleClick = vi.fn()
    useWhatsappCallStarterMock.mockImplementation(() => callStarterMock)
    voipCallContextMock.current = {}
  })

  test("0 WhatsApp numbers: renders no call control", () => {
    chatStoreState.conversations = [{ id: "conv-1", contactInboxes: [] }]
    const el = renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )
    expect(
      el.querySelector(`[aria-label="whatsapp.calls.startCall"]`),
    ).toBeNull()
  })

  test("1 WhatsApp number: renders a direct-dial button (no picker)", () => {
    chatStoreState.conversations = [
      {
        id: "conv-1",
        contactInboxes: [whatsappInbox("ci-1", "Main Number")],
      },
    ]
    const el = renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )
    const button = el.querySelector(`[aria-label="whatsapp.calls.startCall"]`)
    expect(button).not.toBeNull()
    // No picker menu — a single number dials directly.
    expect(el.querySelector('[role="menu"]')).toBeNull()
  })

  test("1 WhatsApp number: clicking dials that number via the shared starter", () => {
    chatStoreState.conversations = [
      {
        id: "conv-1",
        contactInboxes: [whatsappInbox("ci-1", "Main Number")],
      },
    ]
    const el = renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )
    act(() => {
      el.querySelector(
        `[aria-label="whatsapp.calls.startCall"]`,
      )?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(callStarterMock.handleClick).toHaveBeenCalledTimes(1)
    expect(useWhatsappCallStarterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        contactInboxId: "ci-1",
      }),
    )
  })

  test("2+ WhatsApp numbers: renders a picker trigger, one row per number named by inbox.name", () => {
    chatStoreState.conversations = [
      {
        id: "conv-1",
        contactInboxes: [
          whatsappInbox("ci-1", "Sales Line"),
          whatsappInbox("ci-2", "Support Line"),
        ],
      },
    ]
    const el = renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )
    const trigger = el.querySelector(`[aria-label="whatsapp.calls.startCall"]`)
    expect(trigger).not.toBeNull()

    act(() => {
      trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(document.body.textContent).toContain("Sales Line")
    expect(document.body.textContent).toContain("Support Line")
  })

  // The picker is a pure selector; one starter host mounts outside the popup,
  // keyed by the committed selection, and dials automatically — rendering the
  // starter inside the dropdown row would get it unmounted mid-click by
  // base-ui's close-on-click before any alert/permission flow could show.
  test("2+ numbers: picking a picker row commits the selection and dials that number via the shared starter with no second click", () => {
    chatStoreState.conversations = [
      {
        id: "conv-1",
        contactInboxes: [
          whatsappInbox("ci-1", "Sales Line"),
          whatsappInbox("ci-2", "Support Line"),
        ],
      },
    ]
    const el = renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )
    act(() => {
      el.querySelector(
        `[aria-label="whatsapp.calls.startCall"]`,
      )?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const supportRow = Array.from(
      document.querySelectorAll('[role="menuitem"]'),
    ).find((row) => row.textContent === "Support Line")

    act(() => {
      supportRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(useWhatsappCallStarterMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conversationId: "conv-1",
        contactInboxId: "ci-2",
      }),
    )
    expect(callStarterMock.handleClick).toHaveBeenCalledTimes(1)
  })

  // A number that needs permission first must never be blindly dialed (that
  // would just bounce back with a "needsPermission" alert) — it gets the
  // same `RequestCallPermissionDialog` the header uses, auto-opened.
  test("2+ numbers: picking a row that needs permission first opens the request-permission dialog instead of dialing", () => {
    callStarterMock.isVoipMode = true
    callStarterMock.canDialDirectly = false
    chatStoreState.conversations = [
      {
        id: "conv-1",
        contactInboxes: [
          whatsappInbox("ci-1", "Sales Line"),
          whatsappInbox("ci-2", "Support Line"),
        ],
      },
    ]
    const el = renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )
    act(() => {
      el.querySelector(
        `[aria-label="whatsapp.calls.startCall"]`,
      )?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const salesRow = Array.from(
      document.querySelectorAll('[role="menuitem"]'),
    ).find((row) => row.textContent === "Sales Line")

    act(() => {
      salesRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(callStarterMock.handleClick).not.toHaveBeenCalled()
    expect(
      document.querySelector(
        `[aria-label="whatsapp.calls.permissionRequestTitle"]`,
      ),
    ).not.toBeNull()
  })

  test("hidden entirely when calling is disabled for this workspace/member", () => {
    callStarterMock.voipCallContext = null
    voipCallContextMock.current = null
    chatStoreState.conversations = [
      {
        id: "conv-1",
        contactInboxes: [whatsappInbox("ci-1", "Main Number")],
      },
    ]
    const el = renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )
    expect(
      el.querySelector(`[aria-label="whatsapp.calls.startCall"]`),
    ).toBeNull()
  })

  test("non-WhatsApp contactInboxes are excluded from the count", () => {
    chatStoreState.conversations = [
      {
        id: "conv-1",
        contactInboxes: [
          {
            id: "ci-1",
            inboxId: "inbox-1",
            channel: "messenger",
            inbox: { name: "FB Page" },
          },
        ],
      },
    ]
    const el = renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )
    expect(
      el.querySelector(`[aria-label="whatsapp.calls.startCall"]`),
    ).toBeNull()
  })

  // Without the picked contactInbox's own `inboxId`,
  // `requestCallPermissionAction` falls back to "any WhatsApp ContactInbox"
  // of the contact, which can send the request from the wrong business
  // number when the contact has several. The dialog must receive the picked
  // row's `inboxId`, not its `contactInbox.id`.
  test("1 WhatsApp number: RequestCallPermissionDialog receives the picked contactInbox's inboxId", () => {
    callStarterMock.isVoipMode = true
    callStarterMock.canDialDirectly = false
    chatStoreState.conversations = [
      {
        id: "conv-1",
        contactInboxes: [whatsappInbox("ci-1", "Main Number", "inbox-main")],
      },
    ]
    renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )

    expect(requestCallPermissionDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({ inboxId: "inbox-main" }),
    )
  })

  test("2+ numbers: picking a row that needs permission opens the dialog with THAT row's inboxId", () => {
    callStarterMock.isVoipMode = true
    callStarterMock.canDialDirectly = false
    chatStoreState.conversations = [
      {
        id: "conv-1",
        contactInboxes: [
          whatsappInbox("ci-1", "Sales Line", "inbox-sales"),
          whatsappInbox("ci-2", "Support Line", "inbox-support"),
        ],
      },
    ]
    const el = renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )
    act(() => {
      el.querySelector(
        `[aria-label="whatsapp.calls.startCall"]`,
      )?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const supportRow = Array.from(
      document.querySelectorAll('[role="menuitem"]'),
    ).find((row) => row.textContent === "Support Line")

    act(() => {
      supportRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(requestCallPermissionDialogMock).toHaveBeenCalledWith(
      expect.objectContaining({ inboxId: "inbox-support" }),
    )
  })

  // A picker selection made on a prior conversation must never carry over to
  // a newly active one — it would resolve a foreign contactInbox against
  // the new conversation's contact.
  test("2+ numbers: picking a row, then switching conversations, clears the stale selection", () => {
    chatStoreState.conversations = [
      {
        id: "conv-1",
        contactInboxes: [
          whatsappInbox("ci-1", "Sales Line"),
          whatsappInbox("ci-2", "Support Line"),
        ],
      },
      {
        id: "conv-2",
        contactInboxes: [
          whatsappInbox("ci-3", "Sales Line"),
          whatsappInbox("ci-4", "Support Line"),
        ],
      },
    ]
    renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )
    const trigger = () =>
      container?.querySelector(`[aria-label="whatsapp.calls.startCall"]`)
    act(() => {
      trigger()?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const supportRow = Array.from(
      document.querySelectorAll('[role="menuitem"]'),
    ).find((row) => row.textContent === "Support Line")
    act(() => {
      supportRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(useWhatsappCallStarterMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ contactInboxId: "ci-2" }),
    )

    rerenderComponent(
      <ContactDetail activeConversationId="conv-2" contact={baseContact} />,
    )

    // The stale `ci-2` selection from `conv-1` must not resolve against
    // `conv-2` — the starter must never see that (foreign) combination.
    expect(useWhatsappCallStarterMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        contactInboxId: "ci-2",
        conversationId: "conv-2",
      }),
    )
  })

  // A failed outbound-call-mode resolve in `autoTrigger` mode has no visible
  // control to show an error state on, so it must surface feedback via toast
  // instead of silently rendering null forever.
  test("2+ numbers, autoTrigger: an outbound-call-mode resolve error surfaces a toast instead of silently rendering null", () => {
    chatStoreState.conversations = [
      {
        id: "conv-1",
        contactInboxes: [
          whatsappInbox("ci-1", "Sales Line"),
          whatsappInbox("ci-2", "Support Line"),
        ],
      },
    ]
    const el = renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )
    act(() => {
      el.querySelector(
        `[aria-label="whatsapp.calls.startCall"]`,
      )?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const salesRow = Array.from(
      document.querySelectorAll('[role="menuitem"]'),
    ).find((row) => row.textContent === "Sales Line")

    outboundCallModeMock.isError = true
    outboundCallModeMock.error = new Error("whatsapp.calls.outbound.callFailed")
    act(() => {
      salesRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(toastErrorMock).toHaveBeenCalledWith(
      "whatsapp.calls.outbound.callFailed",
    )
  })

  // `resolveOutboundCallModeAction` returns `{ mode: "none", reason:
  // "callAccessDenied" }` as ordinary query data rather than throwing, so it
  // flows through the shared starter's `mode: "none"` alert path, never
  // through this component's generic-failure toast.
  test("2+ numbers, autoTrigger: a mode:none/callAccessDenied resolve routes through the shared starter, not the generic-failure toast", () => {
    chatStoreState.conversations = [
      {
        id: "conv-1",
        contactInboxes: [
          whatsappInbox("ci-1", "Sales Line"),
          whatsappInbox("ci-2", "Support Line"),
        ],
      },
    ]
    const el = renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )
    act(() => {
      el.querySelector(
        `[aria-label="whatsapp.calls.startCall"]`,
      )?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    const salesRow = Array.from(
      document.querySelectorAll('[role="menuitem"]'),
    ).find((row) => row.textContent === "Sales Line")

    outboundCallModeMock.data = { mode: "none", reason: "callAccessDenied" }
    act(() => {
      salesRow?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    expect(callStarterMock.handleClick).toHaveBeenCalledTimes(1)
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  // A mode-query error must still render the button enabled (the query never
  // retries, so `outboundCallMode` would otherwise never resolve and the
  // button would stay disabled forever); a click re-shows the generic-
  // failure toast.
  test("1 WhatsApp number: a mode-query error keeps the call button visible and clickable (not stuck disabled), and clicking it shows feedback", () => {
    chatStoreState.conversations = [
      {
        id: "conv-1",
        contactInboxes: [whatsappInbox("ci-1", "Main Number")],
      },
    ]
    callStarterMock.isResolvingMode = true
    outboundCallModeMock.isError = true
    outboundCallModeMock.error = new Error("network error")
    const el = renderComponent(
      <ContactDetail activeConversationId="conv-1" contact={baseContact} />,
    )

    const button = el.querySelector(`[aria-label="whatsapp.calls.startCall"]`)
    expect(button).not.toBeNull()
    expect(button?.hasAttribute("disabled")).toBe(false)

    toastErrorMock.mockClear()
    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(toastErrorMock).toHaveBeenCalledWith(
      "whatsapp.calls.outbound.callFailed",
    )
    // The stuck-disabled control never even reaches the shared starter.
    expect(callStarterMock.handleClick).not.toHaveBeenCalled()
  })
})
