import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ListConversationItemResource } from "@/features/conversations/schema/resource"

const authSessionMock = vi.fn()

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}:${values.name}` : key,
}))

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { useSession: authSessionMock },
}))

vi.mock(
  "@/features/conversations/components/assign-conversation-dialog",
  () => ({
    default: ({ trigger }: { trigger: ReactElement }) => trigger,
  }),
)

// Dynamic import ensures mocks are installed before the client component loads.
const { UpdateConversationAssignee } = await import(
  "@/features/conversations/components/update-conversation-assignee"
)

type ConversationOverrides = Omit<
  Partial<ListConversationItemResource>,
  "assignedInboxTeam" | "assignedUser"
> & {
  assignedInboxTeam?: { name: string | null } | null
  assignedUser?: { name: string | null } | null
}

const makeConversation = (
  overrides: ConversationOverrides = {},
): ListConversationItemResource =>
  ({
    id: "conversation-1",
    contactId: "contact-1",
    workspaceId: "workspace-1",
    assignedUserId: null,
    assignedInboxTeamId: null,
    ...overrides,
  }) as ListConversationItemResource

describe("UpdateConversationAssignee", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    vi.clearAllMocks()
    authSessionMock.mockReturnValue({ data: { user: { id: "current-user" } } })
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const render = async (conversation: ListConversationItemResource) => {
    await act(() => {
      root.render(
        <UpdateConversationAssignee
          conversation={conversation}
          onChange={vi.fn()}
        />,
      )
    })
  }

  test("renders the assigned user's name without requesting assignee options", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")

    await render(
      makeConversation({
        assignedUserId: "user-1",
        assignedUser: { name: "Ada Lovelace" },
      }),
    )

    expect(container.textContent).toContain(
      "assignAdmin.assignedTo:Ada Lovelace",
    )
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  test("renders the assigned inbox team's name", async () => {
    await render(
      makeConversation({
        assignedInboxTeamId: "team-1",
        assignedInboxTeam: { name: "Support" },
      }),
    )

    expect(container.textContent).toContain("assignAdmin.assignedTo:Support")
  })

  test.each([
    {
      assignedUser: { name: null },
      assignedUserId: "user-1",
    },
    {
      assignedInboxTeam: { name: null },
      assignedInboxTeamId: "team-1",
    },
  ])("uses the assignment fallback when the assignee name is missing", async (conversation) => {
    await render(makeConversation(conversation))

    expect(container.textContent).toContain("assignAdmin.assignConversation")
    expect(container.textContent).not.toContain("--")
  })
})
