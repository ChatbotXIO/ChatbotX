// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// ContactInboxPanel — the "latest request wins" guard around
// `getContactAuthenticatedAPI`. The panel fires an initial fetch on open AND
// (via `useAutoRefreshContactProfile`'s `onProfileUpdated` callback) a
// convergence re-fetch once the auto-refresh applies an update. Those two
// requests can settle out of order (the initial one is often slower — it
// races the Graph/Telegram round trip the refresh triggers) — whichever
// request was issued LAST must win, never whichever RESOLVES last.
// ---------------------------------------------------------------------------

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const getContactMock = vi.fn()
const listCouponsMock = vi.fn(async (_input: unknown) => [])
const listAppointmentsMock = vi.fn(async (_input: unknown) => [])
vi.mock("@/lib/orpc/orpc", () => ({
  client: {
    contactsAPIs: {
      getContactAuthenticatedAPI: (input: unknown) => getContactMock(input),
    },
    couponsAPI: {
      listContactCouponsAPI: (input: unknown) => listCouponsMock(input),
    },
    appointmentsAPI: {
      listContactAppointmentsAPI: (input: unknown) =>
        listAppointmentsMock(input),
    },
  },
}))

let latestConversations: unknown[] = []
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: <T,>(
    selector: (state: {
      conversations: unknown[]
      updateContact: () => void
    }) => T,
  ) => selector({ conversations: latestConversations, updateContact: vi.fn() }),
}))

// Captures the props `ContactInboxPanel` passes to the hook, including
// `onProfileUpdated`, so the test can invoke it directly to simulate the
// hook's own async `.then()` firing without re-driving the whole
// refreshContactProfileAction plumbing (already covered in
// use-auto-refresh-contact-profile.test.tsx).
type CapturedHookProps = {
  onProfileUpdated?: (contactId: string) => void
  setContactData?: (
    updater: (prev: { firstName: string | null } | null) => unknown,
  ) => void
}
const hookCalls: CapturedHookProps[] = []
vi.mock("@/features/contacts/hooks/use-auto-refresh-contact-profile", () => ({
  useAutoRefreshContactProfile: (props: CapturedHookProps) => {
    hookCalls.push(props)
  },
}))

vi.mock("@/features/contacts/contact-detail", () => ({
  ContactDetail: ({
    contact,
  }: {
    contact: { firstName?: string | null } | null
  }) => (
    <div data-testid="contact-detail">{contact?.firstName ?? "no-name"}</div>
  ),
}))

vi.mock("@/features/contact-notes/contact-notes-manage", () => ({
  ContactNotesManage: () => null,
}))

vi.mock("@/features/contacts/components/contact-appointments-list", () => ({
  ContactAppointmentsList: () => null,
}))

vi.mock("@/features/contacts/components/update-contact-tag-field", () => ({
  default: () => null,
}))

vi.mock("@/features/contact-sequences/update-contact-sequence-field", () => ({
  default: () => null,
}))

vi.mock("@/features/sequences/provider/sequence-store-context", () => ({
  SequenceStoreProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}))

vi.mock("@chatbotx.io/ui/components/ui/accordion", () => ({
  Accordion: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AccordionItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AccordionTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AccordionContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

const { ContactInboxPanel } = await import(
  "@/features/contacts/contact-inbox-panel"
)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  // Attach a no-op catch handler so an intentionally-unresolved/rejected
  // deferred never surfaces as an unhandled rejection warning in tests that
  // never await this promise directly (the component under test consumes
  // it via `.then()/.catch()`, which is what's actually under test).
  promise.catch(() => undefined)
  return { promise, resolve, reject }
}

const baseConversation = {
  id: "conv-1",
  contactId: "contact-1",
  contact: { id: "contact-1", firstName: null, lastName: null },
  contactInboxes: [],
}

describe("ContactInboxPanel", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    getContactMock.mockReset()
    listCouponsMock.mockClear()
    listAppointmentsMock.mockClear()
    hookCalls.length = 0
    latestConversations = [baseConversation]
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  function render() {
    act(() => {
      root.render(
        <ContactInboxPanel activeConversationId="conv-1" workspaceId="ws-1" />,
      )
    })
  }

  test("normal open (no refresh in flight) applies the fetched contact", async () => {
    const { promise, resolve } = deferred<{ firstName: string | null }>()
    getContactMock.mockReturnValueOnce(promise)

    render()

    expect(getContactMock).toHaveBeenCalledTimes(1)
    expect(getContactMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
    })

    await act(async () => {
      resolve({ firstName: "Jane" })
      await Promise.resolve()
    })

    const detail = container.querySelector('[data-testid="contact-detail"]')
    expect(detail?.textContent).toBe("Jane")
  })

  test("initial getContact resolves AFTER the refresh-triggered re-fetch → the panel keeps the refreshed data (latest request wins, not latest to resolve)", async () => {
    const initialFetch = deferred<{ firstName: string | null }>()
    const refreshFetch = deferred<{ firstName: string | null }>()
    getContactMock
      .mockReturnValueOnce(initialFetch.promise) // the panel's own initial fetch on open
      .mockReturnValueOnce(refreshFetch.promise) // triggered by onProfileUpdated

    render()
    expect(getContactMock).toHaveBeenCalledTimes(1)

    // Simulate the auto-refresh hook applying an update and calling back
    // into the panel — this fires the SECOND (later-issued) fetch while the
    // first is still in flight.
    const onProfileUpdated = hookCalls.at(-1)?.onProfileUpdated
    expect(onProfileUpdated).toBeTypeOf("function")
    act(() => {
      onProfileUpdated?.("contact-1")
    })
    expect(getContactMock).toHaveBeenCalledTimes(2)

    // The later-issued (refresh) request resolves FIRST with the real name.
    await act(async () => {
      refreshFetch.resolve({ firstName: "Jane" })
      await Promise.resolve()
    })
    let detail = container.querySelector('[data-testid="contact-detail"]')
    expect(detail?.textContent).toBe("Jane")

    // The earlier (initial) request resolves AFTER — stale data must be
    // discarded, not applied over the refreshed name.
    await act(async () => {
      initialFetch.resolve({ firstName: null })
      await Promise.resolve()
    })
    detail = container.querySelector('[data-testid="contact-detail"]')
    expect(detail?.textContent).toBe("Jane")
  })
  test("refresh patch applied, then the convergence re-fetch REJECTS → the panel keeps the patched name (does not wipe to null)", async () => {
    const initialFetch = deferred<{ firstName: string | null }>()
    getContactMock.mockReturnValueOnce(initialFetch.promise) // the panel's own initial fetch on open

    render()
    expect(getContactMock).toHaveBeenCalledTimes(1)

    // Initial fetch resolves with the (nameless) contact — this is what
    // would have made the contact eligible for auto-refresh in real code.
    await act(async () => {
      initialFetch.resolve({ firstName: null })
      await Promise.resolve()
    })
    let detail = container.querySelector('[data-testid="contact-detail"]')
    expect(detail?.textContent).toBe("no-name")

    const { setContactData, onProfileUpdated } = hookCalls.at(-1) ?? {}
    expect(setContactData).toBeTypeOf("function")
    expect(onProfileUpdated).toBeTypeOf("function")

    const convergenceFetch = deferred<{ firstName: string | null }>()
    getContactMock.mockReturnValueOnce(convergenceFetch.promise)

    // Mirrors what the real (unmocked) hook does: patch `contactData`
    // locally via `setContactData`, then call `onProfileUpdated` to kick
    // off the convergence re-fetch.
    act(() => {
      setContactData?.((prev) => prev && { ...prev, firstName: "Jane" })
      onProfileUpdated?.("contact-1")
    })
    expect(getContactMock).toHaveBeenCalledTimes(2)

    detail = container.querySelector('[data-testid="contact-detail"]')
    expect(detail?.textContent).toBe("Jane")

    // The convergence re-fetch fails (network blip / RSC error) — the
    // already-patched name must survive, not be wiped to null.
    await act(async () => {
      convergenceFetch.reject(new Error("network error"))
      await Promise.resolve()
    })
    detail = container.querySelector('[data-testid="contact-detail"]')
    expect(detail?.textContent).toBe("Jane")
  })

  test("initial fetch failure still clears the panel (pre-existing behaviour, unchanged)", async () => {
    const initialFetch = deferred<{ firstName: string | null }>()
    getContactMock.mockReturnValueOnce(initialFetch.promise)

    render()
    expect(getContactMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      initialFetch.reject(new Error("network error"))
      await Promise.resolve()
    })

    const detail = container.querySelector('[data-testid="contact-detail"]')
    expect(detail?.textContent).toBe("no-name")
  })
})
