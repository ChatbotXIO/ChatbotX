// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ContactInboxPanel } from "@/features/contacts/contact-inbox-panel"
import type { UseAutoRefreshContactProfileProps } from "@/features/contacts/hooks/use-auto-refresh-contact-profile"
import type { ThreadControlView } from "@/features/conversations/utils/thread-control"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const getContactMock = vi.fn()
const notesMock = vi.fn().mockResolvedValue({ data: [] })
const couponsMock = vi.fn().mockResolvedValue([])
const appointmentsMock = vi.fn().mockResolvedValue([])
const sequencesMock = vi.fn().mockResolvedValue({ data: [] })
vi.mock("@/lib/orpc/query", () => ({
  orpc: {
    contactsAPIs: {
      getContactAuthenticatedAPI: {
        queryOptions: ({
          input,
          enabled,
          initialData,
        }: {
          input: { workspaceId: string; contactId: string }
          enabled: boolean
          initialData: unknown
        }) => ({
          queryKey: ["get-contact", input.workspaceId, input.contactId],
          queryFn: () => getContactMock(input),
          enabled,
          initialData,
        }),
      },
    },
    contactNotesAPI: {
      listContactNotesAuthenticatedAPI: {
        queryOptions: ({
          input,
        }: {
          input: { workspaceId: string; contactId: string }
        }) => ({
          queryKey: ["contact-notes", input.workspaceId, input.contactId],
          queryFn: () => notesMock(input),
        }),
      },
    },
    couponsAPI: {
      listContactCouponsAPI: {
        queryOptions: ({
          input,
        }: {
          input: { workspaceId: string; contactId: string }
        }) => ({
          queryKey: ["contact-coupons", input.workspaceId, input.contactId],
          queryFn: () => couponsMock(input),
        }),
      },
    },
    appointmentsAPI: {
      listContactAppointmentsAPI: {
        queryOptions: ({
          input,
        }: {
          input: { workspaceId: string; contactId: string }
        }) => ({
          queryKey: [
            "contact-appointments",
            input.workspaceId,
            input.contactId,
          ],
          queryFn: () => appointmentsMock(input),
        }),
      },
    },
    contactSequencesAPI: {
      listContactSequencesAuthenticatedAPI: {
        queryOptions: ({
          input,
        }: {
          input: { workspaceId: string; contactId: string }
        }) => ({
          queryKey: ["contact-sequences", input.workspaceId, input.contactId],
          queryFn: () => sequencesMock(input),
        }),
      },
    },
  },
}))

let latestConversations: unknown[] = []
let seededContact: unknown
vi.mock("@/features/chat/store/chat-store-provider", () => ({
  useChatStore: <T,>(
    selector: (state: {
      conversations: unknown[]
      seededContact: unknown
      updateContact: () => void
    }) => T,
  ) =>
    selector({
      conversations: latestConversations,
      seededContact,
      updateContact: vi.fn(),
    }),
}))
let autoRefreshCapture: Partial<UseAutoRefreshContactProfileProps> = {}
vi.mock("@/features/contacts/hooks/use-auto-refresh-contact-profile", () => ({
  useAutoRefreshContactProfile: (props: UseAutoRefreshContactProfileProps) => {
    autoRefreshCapture = props
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

let latestAccordionOnValueChange: ((value: string[]) => void) | undefined

vi.mock("@chatbotx.io/ui/components/ui/accordion", () => ({
  Accordion: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode
    onValueChange: (value: string[]) => void
  }) => {
    latestAccordionOnValueChange = onValueChange
    return <div>{children}</div>
  },
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

const threadControlView = vi.hoisted(() => ({
  current: null as ThreadControlView | null,
}))
vi.mock("@/features/conversations/hooks/use-thread-control", () => ({
  useThreadControl: () => threadControlView.current,
}))
vi.mock(
  "@/features/contacts/components/contact-thread-control-section",
  () => ({
    ContactThreadControlSection: () => <div data-testid="routing-section" />,
  }),
)

const ROUTING_SECTION_KEY = "conversationRouting.panel.title"

const makeThreadControlView = (
  state: ThreadControlView["state"],
): ThreadControlView => ({
  contactInboxId: "ci-1",
  state,
  ownerRole: null,
  updatedAt: null,
  canRelease: false,
  canPass: false,
  isLocked: state === "standby",
  idleAt: null,
  now: new Date(),
})

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 30_000,
      },
    },
  })

const makeContact = (id: string, firstName: string | null) => ({
  id,
  firstName,
  lastName: null,
  tags: [],
})

const firstConversation = {
  id: "conv-1",
  contactId: "contact-1",
  contact: { id: "contact-1", firstName: null, lastName: null },
  contactInboxes: [],
}

const secondConversation = {
  id: "conv-2",
  contactId: "contact-2",
  contact: { id: "contact-2", firstName: null, lastName: null },
  contactInboxes: [],
}

describe("ContactInboxPanel", () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    queryClient = makeQueryClient()
    getContactMock.mockReset()
    notesMock.mockClear()
    couponsMock.mockClear()
    appointmentsMock.mockClear()
    sequencesMock.mockClear()
    latestAccordionOnValueChange = undefined
    threadControlView.current = null
    seededContact = undefined
    latestConversations = [firstConversation, secondConversation]
    autoRefreshCapture = {}
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    queryClient.clear()
  })

  const render = (activeConversationId = "conv-1") => {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <ContactInboxPanel
            activeConversationId={activeConversationId}
            workspaceId="ws-1"
          />
        </QueryClientProvider>,
      )
    })
  }

  test("uses the matching seeded contact without calling getContact", () => {
    seededContact = makeContact("contact-1", "Seeded Jane")

    render()

    expect(getContactMock).not.toHaveBeenCalled()
    expect(
      container.querySelector('[data-testid="contact-detail"]')?.textContent,
    ).toBe("Seeded Jane")
  })

  test("fetches exactly once when the seeded contact is for another contact", async () => {
    seededContact = makeContact("contact-2", "Other contact")
    getContactMock.mockResolvedValue(makeContact("contact-1", "Jane"))

    render()

    await vi.waitFor(() => {
      expect(getContactMock).toHaveBeenCalledTimes(1)
    })
    expect(getContactMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
    })
  })

  test("applies fetched contact data", async () => {
    getContactMock.mockResolvedValue(makeContact("contact-1", "Jane"))

    render()

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="contact-detail"]')?.textContent,
      ).toBe("Jane")
    })
  })

  test("retries a previously failed contact after revisiting it", async () => {
    getContactMock
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce(makeContact("contact-2", "B"))
      .mockResolvedValueOnce(makeContact("contact-1", "Recovered A"))

    render("conv-1")
    await vi.waitFor(() => {
      expect(getContactMock).toHaveBeenCalledTimes(1)
      expect(
        queryClient.getQueryState(["get-contact", "ws-1", "contact-1"])?.status,
      ).toBe("error")
    })

    render("conv-2")
    await vi.waitFor(() => {
      expect(getContactMock).toHaveBeenCalledTimes(2)
    })

    render("conv-1")
    await vi.waitFor(() => {
      expect(getContactMock).toHaveBeenCalledTimes(3)
      expect(
        container.querySelector('[data-testid="contact-detail"]')?.textContent,
      ).toBe("Recovered A")
    })
  })

  test("keeps a background-patched contact after a rejected convergence refetch", async () => {
    getContactMock.mockResolvedValueOnce(makeContact("contact-1", "Jane"))

    render()

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="contact-detail"]')?.textContent,
      ).toBe("Jane")
    })

    act(() => {
      autoRefreshCapture.setContactData?.((previous) =>
        previous ? { ...previous, firstName: "Patched Jane" } : previous,
      )
    })

    await vi.waitFor(() => {
      expect(
        container.querySelector('[data-testid="contact-detail"]')?.textContent,
      ).toBe("Patched Jane")
    })

    getContactMock.mockRejectedValueOnce(new Error("network error"))

    await act(async () => {
      await autoRefreshCapture.onProfileUpdated?.("contact-1")
    })

    await vi.waitFor(() => {
      expect(
        queryClient.getQueryState(["get-contact", "ws-1", "contact-1"])?.status,
      ).toBe("error")
    })

    expect(
      container.querySelector('[data-testid="contact-detail"]')?.textContent,
    ).toBe("Patched Jane")
  })

  test("does not mount or query the coupons/appointments/sequences sections before any accordion item opens", () => {
    seededContact = makeContact("contact-1", "Jane")

    render()

    expect(couponsMock).not.toHaveBeenCalled()
    expect(appointmentsMock).not.toHaveBeenCalled()
    expect(sequencesMock).not.toHaveBeenCalled()
  })

  test("mounts and queries the coupons section once its accordion item opens", async () => {
    seededContact = makeContact("contact-1", "Jane")
    couponsMock.mockResolvedValueOnce([
      {
        id: "coupon-1",
        topicName: "Welcome",
        code: "WELCOME10",
        usedAt: null,
      },
    ])

    render()
    act(() => {
      latestAccordionOnValueChange?.(["coupons.title"])
    })

    await vi.waitFor(() => {
      expect(couponsMock).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        contactId: "contact-1",
      })
      expect(container.textContent).toContain("Welcome")
    })
    expect(appointmentsMock).not.toHaveBeenCalled()
    expect(sequencesMock).not.toHaveBeenCalled()
  })

  test("shows a loader while the coupons request is pending, not the empty state", async () => {
    seededContact = makeContact("contact-1", "Jane")
    const { promise, resolve } =
      Promise.withResolvers<
        { id: string; topicName: string; code: string; usedAt: Date | null }[]
      >()
    couponsMock.mockReturnValueOnce(promise)

    render()
    act(() => {
      latestAccordionOnValueChange?.(["coupons.title"])
    })

    await vi.waitFor(() => {
      expect(couponsMock).toHaveBeenCalled()
    })
    expect(container.textContent).not.toContain("coupons.messages.empty")

    await act(async () => {
      resolve([])
      await promise
    })

    await vi.waitFor(() => {
      expect(container.textContent).toContain("coupons.messages.empty")
    })
  })

  test("shows a loader while the notes request is pending", async () => {
    seededContact = makeContact("contact-1", "Jane")
    const { promise, resolve } = Promise.withResolvers<{ data: [] }>()
    notesMock.mockReturnValueOnce(promise)

    render()

    await vi.waitFor(() => {
      expect(notesMock).toHaveBeenCalled()
      expect(container.querySelector("svg.animate-spin")).not.toBeNull()
    })

    await act(async () => {
      resolve({ data: [] })
      await promise
    })
  })

  test("disables retry and shows progress while refetching a failed section query", async () => {
    seededContact = makeContact("contact-1", "Jane")
    couponsMock.mockRejectedValueOnce(new Error("network error"))
    const { promise, resolve } =
      Promise.withResolvers<
        { id: string; topicName: string; code: string; usedAt: Date | null }[]
      >()
    couponsMock.mockReturnValueOnce(promise)

    render()
    act(() => {
      latestAccordionOnValueChange?.(["coupons.title"])
    })

    await vi.waitFor(() => {
      expect(container.textContent).toContain("messages.errorLoadingData")
    })

    const retryButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "actions.retry",
    )
    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
      await Promise.resolve()
    })

    await vi.waitFor(() => {
      expect(
        queryClient.getQueryState(["contact-coupons", "ws-1", "contact-1"])
          ?.fetchStatus,
      ).toBe("fetching")
    })
    const { promise: renderFlush, resolve: resolveRenderFlush } =
      Promise.withResolvers<void>()
    setTimeout(resolveRenderFlush, 0)
    await act(() => renderFlush)

    expect(container.querySelector("svg.animate-spin")).not.toBeNull()
    expect(container.textContent).not.toContain("actions.retry")

    await act(async () => {
      resolve([])
      await promise
    })

    await vi.waitFor(() => {
      expect(couponsMock).toHaveBeenCalledTimes(2)
    })
  })

  test("mounts and queries the appointments section once its accordion item opens", async () => {
    seededContact = makeContact("contact-1", "Jane")

    render()
    act(() => {
      latestAccordionOnValueChange?.(["appointments.title"])
    })

    await vi.waitFor(() => {
      expect(appointmentsMock).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        contactId: "contact-1",
      })
    })
  })

  test("mounts and queries the sequences section once its accordion item opens", async () => {
    seededContact = makeContact("contact-1", "Jane")

    render()
    act(() => {
      latestAccordionOnValueChange?.(["sequences.title"])
    })

    await vi.waitFor(() => {
      expect(sequencesMock).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        contactId: "contact-1",
      })
    })
  })
  test("shows a loader while the sequences request is pending", async () => {
    seededContact = makeContact("contact-1", "Jane")
    const { promise, resolve } = Promise.withResolvers<{ data: [] }>()
    sequencesMock.mockReturnValueOnce(promise)

    render()
    act(() => {
      latestAccordionOnValueChange?.(["sequences.title"])
    })

    await vi.waitFor(() => {
      expect(sequencesMock).toHaveBeenCalled()
      expect(container.querySelector("svg.animate-spin")).not.toBeNull()
    })

    await act(async () => {
      resolve({ data: [] })
      await promise
    })
  })

  test("auto-expands the routing section when a partner is handling the thread", () => {
    seededContact = makeContact("contact-1", "Jane")
    threadControlView.current = makeThreadControlView("standby")

    render()

    expect(
      container.querySelector('[data-testid="routing-section"]'),
    ).not.toBeNull()
  })

  test("leaves the routing section collapsed when this app owns the thread", () => {
    seededContact = makeContact("contact-1", "Jane")
    threadControlView.current = makeThreadControlView("owned")

    render()

    expect(
      container.querySelector('[data-testid="routing-section"]'),
    ).toBeNull()

    // The module still exists and opens on demand.
    act(() => latestAccordionOnValueChange?.([ROUTING_SECTION_KEY]))
    expect(
      container.querySelector('[data-testid="routing-section"]'),
    ).not.toBeNull()
  })

  test("expands the routing section when a handover arrives mid-view", () => {
    seededContact = makeContact("contact-1", "Jane")
    threadControlView.current = makeThreadControlView("owned")
    render()
    expect(
      container.querySelector('[data-testid="routing-section"]'),
    ).toBeNull()

    // A partner takes over: re-render with the new state, same conversation.
    threadControlView.current = makeThreadControlView("standby")
    render()

    expect(
      container.querySelector('[data-testid="routing-section"]'),
    ).not.toBeNull()
  })
})
