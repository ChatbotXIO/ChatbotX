// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { SetContactData } from "@/features/contacts/hooks/use-auto-refresh-contact-profile"

// ---------------------------------------------------------------------------
// useAutoRefreshContactProfile — selects the newest on-demand-capable inbox
// for a nameless contact, fires refreshContactProfileAction at most once per
// contactId per mount, and patches the store + panel contactData only on a
// status:"updated" result. See
// .superpowers/sdd/2026-08-31-messenger-ctm-profile-backfill/task-3-brief.md
// ---------------------------------------------------------------------------

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const toastMocks = { error: vi.fn(), success: vi.fn() }
vi.mock("sonner", () => ({ toast: toastMocks }))

const executeMock = vi.fn()
let latestOnSuccess: ((args: { data: unknown }) => void) | undefined

vi.mock("next-safe-action/hooks", () => ({
  useAction: (
    _action: unknown,
    options?: { onSuccess?: (args: { data: unknown }) => void },
  ) => {
    latestOnSuccess = options?.onSuccess
    return { execute: executeMock, isPending: false }
  },
}))

vi.mock("@/features/contacts/actions/refresh-contact-profile.action", () => ({
  refreshContactProfileAction: { bind: () => "bound-refresh-action" },
}))

vi.mock("@chatbotx.io/business", () => ({
  hasEmptyProfileName: (contact: {
    firstName?: string | null
    lastName?: string | null
  }) => !(contact.firstName?.trim() || contact.lastName?.trim()),
  hasOnDemandProfileApi: (channel: string) =>
    channel === "messenger" ||
    channel === "instagram" ||
    channel === "zalo" ||
    channel === "telegram",
}))

const updateContactMock = vi.fn()
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: <T,>(
    selector: (state: { updateContact: typeof updateContactMock }) => T,
  ) => selector({ updateContact: updateContactMock }),
}))

const { useAutoRefreshContactProfile } = await import(
  "@/features/contacts/hooks/use-auto-refresh-contact-profile"
)

type TestContact = {
  id: string
  avatar?: string | null
  firstName: string | null
  lastName: string | null
}
type TestContactInbox = {
  id: string
  channel: string
  lastMessageAt: string | null
}
type TestConversation = {
  id: string
  contactId: string
  contact: TestContact | null
  contactInboxes: TestContactInbox[]
}

const namelessContact = (id: string): TestContact => ({
  id,
  avatar: null,
  firstName: null,
  lastName: null,
})

const conversation = (
  overrides: Partial<TestConversation> & { contactId: string },
): TestConversation => ({
  id: `conv-${overrides.contactId}`,
  contact: namelessContact(overrides.contactId),
  contactInboxes: [],
  ...overrides,
})

function HookHost({
  workspaceId,
  conv,
  setContactData,
}: {
  workspaceId: string
  conv: TestConversation | null
  setContactData: SetContactData
}) {
  useAutoRefreshContactProfile({
    workspaceId,
    // The hook only reads `contact`/`contactId`/`contactInboxes`, so this
    // narrow fixture shape stands in for the full ListConversationItemResource.
    conversation: conv as unknown as Parameters<
      typeof useAutoRefreshContactProfile
    >[0]["conversation"],
    setContactData,
  })
  return null
}

describe("useAutoRefreshContactProfile", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    executeMock.mockClear()
    updateContactMock.mockClear()
    toastMocks.error.mockClear()
    toastMocks.success.mockClear()
    latestOnSuccess = undefined
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function render(conv: TestConversation | null, setContactData = vi.fn()) {
    act(() => {
      root.render(
        <HookHost
          conv={conv}
          setContactData={setContactData}
          workspaceId="ws-1"
        />,
      )
    })
    return setContactData
  }

  test("fires once for a nameless messenger contact", () => {
    render(
      conversation({
        contactId: "contact-1",
        contactInboxes: [
          { id: "ci-1", channel: "messenger", lastMessageAt: null },
        ],
      }),
    )

    expect(executeMock).toHaveBeenCalledTimes(1)
    expect(executeMock).toHaveBeenCalledWith({ contactInboxId: "ci-1" })
  })

  test("does not fire for a contact with either name present", () => {
    render(
      conversation({
        contactId: "contact-2",
        contact: { id: "contact-2", firstName: "Jane", lastName: null },
        contactInboxes: [
          { id: "ci-2", channel: "messenger", lastMessageAt: null },
        ],
      }),
    )

    expect(executeMock).not.toHaveBeenCalled()
  })

  test("does not fire for a non-capable channel", () => {
    render(
      conversation({
        contactId: "contact-3",
        contactInboxes: [
          { id: "ci-3", channel: "whatsapp", lastMessageAt: null },
        ],
      }),
    )

    expect(executeMock).not.toHaveBeenCalled()
  })

  test("with two messenger inboxes, picks the most recent lastMessageAt and does not fall back when the action returns failed", () => {
    render(
      conversation({
        contactId: "contact-4",
        contactInboxes: [
          {
            id: "ci-older",
            channel: "messenger",
            lastMessageAt: "2026-01-01T00:00:00Z",
          },
          {
            id: "ci-newer",
            channel: "messenger",
            lastMessageAt: "2026-06-01T00:00:00Z",
          },
        ],
      }),
    )

    expect(executeMock).toHaveBeenCalledTimes(1)
    expect(executeMock).toHaveBeenCalledWith({ contactInboxId: "ci-newer" })

    act(() => {
      latestOnSuccess?.({ data: { status: "failed" } })
    })

    // No retry against the older inbox — a failed attempt is never retried
    // on a different inbox.
    expect(executeMock).toHaveBeenCalledTimes(1)
    expect(updateContactMock).not.toHaveBeenCalled()
  })

  test("does not re-fire on re-render or on returning to the same conversation while mounted", () => {
    const conv1 = conversation({
      contactId: "contact-5",
      contactInboxes: [
        { id: "ci-5", channel: "messenger", lastMessageAt: null },
      ],
    })
    const conv2 = conversation({
      contactId: "contact-6",
      contact: { id: "contact-6", firstName: "Bob", lastName: null },
      contactInboxes: [
        { id: "ci-6", channel: "messenger", lastMessageAt: null },
      ],
    })

    render(conv1)
    expect(executeMock).toHaveBeenCalledTimes(1)

    // Re-render with the same conversation (new object reference).
    render({ ...conv1 })
    expect(executeMock).toHaveBeenCalledTimes(1)

    // Switch to a different (non-eligible) conversation, then back.
    render(conv2)
    expect(executeMock).toHaveBeenCalledTimes(1)
    render({ ...conv1 })
    expect(executeMock).toHaveBeenCalledTimes(1)
  })

  test("re-fires after a remount", () => {
    const conv = conversation({
      contactId: "contact-7",
      contactInboxes: [
        { id: "ci-7", channel: "messenger", lastMessageAt: null },
      ],
    })

    render(conv)
    expect(executeMock).toHaveBeenCalledTimes(1)

    act(() => {
      root.unmount()
    })
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    executeMock.mockClear()

    render(conv)
    expect(executeMock).toHaveBeenCalledTimes(1)
  })

  test("on updated, patches both the store conversation(s) and the panel contactData", () => {
    const setContactData = render(
      conversation({
        contactId: "contact-8",
        contactInboxes: [
          { id: "ci-8", channel: "messenger", lastMessageAt: null },
        ],
      }),
    )

    const updatedContact = {
      id: "contact-8",
      avatar: "avatars/contact-8.png",
      firstName: "Jane",
      lastName: "Doe",
    }

    act(() => {
      latestOnSuccess?.({
        data: { status: "updated", contact: updatedContact },
      })
    })

    expect(updateContactMock).toHaveBeenCalledWith("contact-8", updatedContact)
    expect(setContactData).toHaveBeenCalledTimes(1)
    const updater = setContactData.mock.calls[0]?.[0] as (
      prev: unknown,
    ) => unknown
    const prev = { id: "contact-8", avatar: null, tags: [] }
    expect(updater(prev)).toEqual({ ...prev, ...updatedContact })
    expect(toastMocks.error).not.toHaveBeenCalled()
    expect(toastMocks.success).not.toHaveBeenCalled()
  })

  test.each([
    "skipped",
    "unavailable",
    "failed",
  ] as const)("on %s, nothing changes and no toast", (status) => {
    const setContactData = render(
      conversation({
        contactId: `contact-status-${status}`,
        contactInboxes: [
          { id: `ci-${status}`, channel: "messenger", lastMessageAt: null },
        ],
      }),
    )

    act(() => {
      latestOnSuccess?.({
        data:
          status === "skipped"
            ? { status, reason: "profileComplete" }
            : { status },
      })
    })

    expect(updateContactMock).not.toHaveBeenCalled()
    expect(setContactData).not.toHaveBeenCalled()
    expect(toastMocks.error).not.toHaveBeenCalled()
    expect(toastMocks.success).not.toHaveBeenCalled()
  })
})
