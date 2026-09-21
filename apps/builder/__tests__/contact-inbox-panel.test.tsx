// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { ContactInboxPanel } from "@/features/contacts/contact-inbox-panel"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

const getContactMock = vi.fn()

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
          queryFn: async () => ({ data: [] }),
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
vi.mock("@/features/contacts/hooks/use-auto-refresh-contact-profile", () => ({
  useAutoRefreshContactProfile: () => undefined,
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
    seededContact = undefined
    latestConversations = [firstConversation, secondConversation]
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
})
