// @vitest-environment jsdom

import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { SetContactData } from "@/features/contacts/hooks/use-auto-refresh-contact-profile"

// ---------------------------------------------------------------------------
// useAutoRefreshContactProfile — selects the newest on-demand-capable inbox
// for a nameless contact, fires refreshContactProfileAction directly (not
// via useAction — see the hook's own doc comment for why: a single
// useAction instance reused across contacts as `conversation` changes would
// let next-safe-action's newer-request-wins tracking silently drop an
// earlier in-flight attempt's result) at most once per contactId per mount,
// and patches the store + panel contactData only on a status:"updated"
// result — independent of any other attempt's order or in-flight state. See
// .superpowers/sdd/2026-08-31-messenger-ctm-profile-backfill/task-3-brief.md
// ---------------------------------------------------------------------------

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const toastMocks = { error: vi.fn(), success: vi.fn() }
vi.mock("sonner", () => ({ toast: toastMocks }))

const refreshContactProfileActionMock = vi.fn()
vi.mock("@/features/contacts/actions/refresh-contact-profile.action", () => ({
  refreshContactProfileAction: (...args: unknown[]) =>
    refreshContactProfileActionMock(...args),
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

// A promise the test controls the settlement of, to simulate an in-flight
// server action call.
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

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
    refreshContactProfileActionMock.mockReset()
    // Default: a never-resolving promise, so tests that don't care about the
    // result don't need to handle settlement.
    refreshContactProfileActionMock.mockReturnValue(
      new Promise(() => undefined),
    )
    updateContactMock.mockClear()
    toastMocks.error.mockClear()
    toastMocks.success.mockClear()
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

  // React (with reactStrictMode: true, apps/builder/next.config.ts)
  // double-invokes effects on initial mount in dev — setup, cleanup, setup —
  // which the plain `render()` helper above never exercises (a bare
  // createRoot().render() only single-invokes). Wrapping in <StrictMode>
  // reproduces that double-invocation so a regression like a cleanup-only
  // isMountedRef (never re-armed on the second setup) shows up here.
  function renderStrict(
    conv: TestConversation | null,
    setContactData = vi.fn(),
  ) {
    act(() => {
      root.render(
        <StrictMode>
          <HookHost
            conv={conv}
            setContactData={setContactData}
            workspaceId="ws-1"
          />
        </StrictMode>,
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

    expect(refreshContactProfileActionMock).toHaveBeenCalledTimes(1)
    expect(refreshContactProfileActionMock).toHaveBeenCalledWith(
      "ws-1",
      "contact-1",
      { contactInboxId: "ci-1" },
    )
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

    expect(refreshContactProfileActionMock).not.toHaveBeenCalled()
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

    expect(refreshContactProfileActionMock).not.toHaveBeenCalled()
  })

  test("with two messenger inboxes, picks the most recent lastMessageAt and does not fall back when the action returns failed", async () => {
    const { promise, resolve } = deferred<{ data: { status: string } }>()
    refreshContactProfileActionMock.mockReturnValueOnce(promise)

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

    expect(refreshContactProfileActionMock).toHaveBeenCalledTimes(1)
    expect(refreshContactProfileActionMock).toHaveBeenCalledWith(
      "ws-1",
      "contact-4",
      { contactInboxId: "ci-newer" },
    )

    await act(async () => {
      resolve({ data: { status: "failed" } })
      await Promise.resolve()
    })

    // No retry against the older inbox — a failed attempt is never retried
    // on a different inbox.
    expect(refreshContactProfileActionMock).toHaveBeenCalledTimes(1)
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
    expect(refreshContactProfileActionMock).toHaveBeenCalledTimes(1)

    // Re-render with the same conversation (new object reference).
    render({ ...conv1 })
    expect(refreshContactProfileActionMock).toHaveBeenCalledTimes(1)

    // Switch to a different (non-eligible) conversation, then back.
    render(conv2)
    expect(refreshContactProfileActionMock).toHaveBeenCalledTimes(1)
    render({ ...conv1 })
    expect(refreshContactProfileActionMock).toHaveBeenCalledTimes(1)
  })

  test("re-fires after a remount", () => {
    const conv = conversation({
      contactId: "contact-7",
      contactInboxes: [
        { id: "ci-7", channel: "messenger", lastMessageAt: null },
      ],
    })

    render(conv)
    expect(refreshContactProfileActionMock).toHaveBeenCalledTimes(1)

    act(() => {
      root.unmount()
    })
    container.remove()
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    refreshContactProfileActionMock.mockClear()
    refreshContactProfileActionMock.mockReturnValue(
      new Promise(() => undefined),
    )

    render(conv)
    expect(refreshContactProfileActionMock).toHaveBeenCalledTimes(1)
  })

  test("on updated, patches both the store conversation(s) and the panel contactData", async () => {
    const { promise, resolve } = deferred<{
      data: { status: string; contact?: unknown }
    }>()
    refreshContactProfileActionMock.mockReturnValueOnce(promise)

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

    await act(async () => {
      resolve({ data: { status: "updated", contact: updatedContact } })
      await Promise.resolve()
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
  ] as const)("on %s, nothing changes and no toast", async (status) => {
    const { promise, resolve } = deferred<{
      data: { status: string; reason?: string }
    }>()
    refreshContactProfileActionMock.mockReturnValueOnce(promise)

    const setContactData = render(
      conversation({
        contactId: `contact-status-${status}`,
        contactInboxes: [
          { id: `ci-${status}`, channel: "messenger", lastMessageAt: null },
        ],
      }),
    )

    await act(async () => {
      resolve(
        status === "skipped"
          ? { data: { status, reason: "profileComplete" } }
          : { data: { status } },
      )
      await Promise.resolve()
    })

    expect(updateContactMock).not.toHaveBeenCalled()
    expect(setContactData).not.toHaveBeenCalled()
    expect(toastMocks.error).not.toHaveBeenCalled()
    expect(toastMocks.success).not.toHaveBeenCalled()
  })

  test("two overlapping attempts (A then B before A resolves) each apply their own result independently", async () => {
    const deferredA = deferred<{
      data: { status: string; contact?: unknown }
    }>()
    const deferredB = deferred<{
      data: { status: string; contact?: unknown }
    }>()
    refreshContactProfileActionMock
      .mockReturnValueOnce(deferredA.promise)
      .mockReturnValueOnce(deferredB.promise)

    const setContactData = vi.fn()
    const convA = conversation({
      contactId: "contact-a",
      contactInboxes: [
        { id: "ci-a", channel: "messenger", lastMessageAt: null },
      ],
    })
    const convB = conversation({
      contactId: "contact-b",
      contactInboxes: [
        { id: "ci-b", channel: "messenger", lastMessageAt: null },
      ],
    })

    // Open contact A — its refresh starts and stays in flight.
    render(convA, setContactData)
    expect(refreshContactProfileActionMock).toHaveBeenCalledTimes(1)

    // Switch to contact B before A resolves — B's refresh starts too.
    render(convB, setContactData)
    expect(refreshContactProfileActionMock).toHaveBeenCalledTimes(2)

    const contactA = { id: "contact-a", firstName: "Alice", lastName: null }
    const contactB = { id: "contact-b", firstName: "Bob", lastName: null }

    // B resolves first (a real Graph/Telegram round trip has no fixed
    // ordering), then A resolves — both must still be applied.
    await act(async () => {
      deferredB.resolve({ data: { status: "updated", contact: contactB } })
      await Promise.resolve()
    })
    expect(updateContactMock).toHaveBeenCalledWith("contact-b", contactB)

    await act(async () => {
      deferredA.resolve({ data: { status: "updated", contact: contactA } })
      await Promise.resolve()
    })
    expect(updateContactMock).toHaveBeenCalledWith("contact-a", contactA)

    expect(updateContactMock).toHaveBeenCalledTimes(2)
    expect(setContactData).toHaveBeenCalledTimes(2)
  })

  test("does not update state after the owning component has unmounted", async () => {
    const { promise, resolve } = deferred<{
      data: { status: string; contact?: unknown }
    }>()
    refreshContactProfileActionMock.mockReturnValueOnce(promise)

    render(
      conversation({
        contactId: "contact-unmount",
        contactInboxes: [
          { id: "ci-unmount", channel: "messenger", lastMessageAt: null },
        ],
      }),
    )
    expect(refreshContactProfileActionMock).toHaveBeenCalledTimes(1)

    act(() => {
      root.unmount()
    })

    await act(async () => {
      resolve({
        data: {
          status: "updated",
          contact: { id: "contact-unmount", firstName: "Late" },
        },
      })
      await Promise.resolve()
    })

    expect(updateContactMock).not.toHaveBeenCalled()
  })

  test("under StrictMode, still applies a refresh that resolves after the double-invoked mount effects", async () => {
    const { promise, resolve } = deferred<{
      data: { status: string; contact?: unknown }
    }>()
    refreshContactProfileActionMock.mockReturnValueOnce(promise)

    const setContactData = renderStrict(
      conversation({
        contactId: "contact-strict",
        contactInboxes: [
          { id: "ci-strict", channel: "messenger", lastMessageAt: null },
        ],
      }),
    )

    const updatedContact = {
      id: "contact-strict",
      firstName: "Jane",
      lastName: "Doe",
    }

    await act(async () => {
      resolve({ data: { status: "updated", contact: updatedContact } })
      await Promise.resolve()
    })

    // Regression guard: a cleanup-only `isMountedRef` (set to false on the
    // StrictMode double-invoke's first cleanup and never re-armed) would
    // silently drop this result for the rest of the mount's lifetime.
    expect(updateContactMock).toHaveBeenCalledWith(
      "contact-strict",
      updatedContact,
    )
    expect(setContactData).toHaveBeenCalledTimes(1)
  })

  test("under StrictMode, fires the action exactly once per contact despite the double-invoked mount effect", () => {
    renderStrict(
      conversation({
        contactId: "contact-strict-once",
        contactInboxes: [
          {
            id: "ci-strict-once",
            channel: "messenger",
            lastMessageAt: null,
          },
        ],
      }),
    )

    // attemptedContactIds.current.add(contactId) runs synchronously, before
    // the async action call, in the FIRST of the two synchronous
    // setup-cleanup-setup invocations — so the second setup's `.has()` check
    // already sees it and bails, and the action fires only once.
    expect(refreshContactProfileActionMock).toHaveBeenCalledTimes(1)
  })
})
