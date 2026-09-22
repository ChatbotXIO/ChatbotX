// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ContactInboxPanel } from "@/features/contacts/contact-inbox-panel"
import type { UseAutoRefreshContactProfileProps } from "@/features/contacts/hooks/use-auto-refresh-contact-profile"

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

type SequenceSummary = {
  sequence: { id: string; name: string }
}

let latestSequenceOnSuccess:
  | ((updatedSequences: SequenceSummary[]) => void)
  | undefined

vi.mock("@/features/contact-sequences/update-contact-sequence-field", () => ({
  default: ({
    onSuccess,
  }: {
    onSuccess?: (updatedSequences: SequenceSummary[]) => void
  }) => {
    latestSequenceOnSuccess = onSuccess
    return null
  },
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
    couponsMock.mockClear()
    notesMock.mockClear()
    appointmentsMock.mockClear()
    sequencesMock.mockClear()
    latestAccordionOnValueChange = undefined
    latestSequenceOnSuccess = undefined
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

  test("does not mount or query the notes/coupons/appointments/sequences sections before any accordion item opens", () => {
    seededContact = makeContact("contact-1", "Jane")

    render()
    expect(notesMock).not.toHaveBeenCalled()

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

  test("mounts and queries the notes section once its accordion item opens", async () => {
    seededContact = makeContact("contact-1", "Jane")

    render()
    act(() => {
      latestAccordionOnValueChange?.(["fields.notes.label"])
    })

    await vi.waitFor(() => {
      expect(notesMock).toHaveBeenCalledWith({
        workspaceId: "ws-1",
        contactId: "contact-1",
      })
    })
  })

  test("shows a loader while the notes request is pending", async () => {
    seededContact = makeContact("contact-1", "Jane")
    const { promise, resolve } = Promise.withResolvers<{ data: [] }>()
    notesMock.mockReturnValueOnce(promise)

    render()
    act(() => {
      latestAccordionOnValueChange?.(["fields.notes.label"])
    })

    await vi.waitFor(() => {
      expect(notesMock).toHaveBeenCalled()
    })
    expect(container.querySelector("svg.animate-spin")).not.toBeNull()

    await act(async () => {
      resolve({ data: [] })
      await promise
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
    })
    expect(container.querySelector("svg.animate-spin")).not.toBeNull()

    await act(async () => {
      resolve({ data: [] })
      await promise
    })
  })

  test("updates the sequence cache after saving sequences", async () => {
    seededContact = makeContact("contact-1", "Jane")
    sequencesMock.mockResolvedValueOnce({ data: [] })

    render()
    act(() => {
      latestAccordionOnValueChange?.(["sequences.title"])
    })

    await vi.waitFor(() => {
      expect(latestSequenceOnSuccess).toBeDefined()
    })

    act(() => {
      latestSequenceOnSuccess?.([
        { sequence: { id: "sequence-1", name: "Welcome sequence" } },
      ])
    })

    expect(
      queryClient.getQueryData(["contact-sequences", "ws-1", "contact-1"]),
    ).toEqual({
      data: [{ sequenceId: "sequence-1", sequenceName: "Welcome sequence" }],
    })
  })
})
