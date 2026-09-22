import { act, type ReactElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { ListConversationItemResource } from "@/features/conversations/schema/resource"

const authSessionMock = vi.fn()
const contactAssigneeOptionsMock = vi.fn(
  (
    _props?: unknown,
  ): {
    isPending: boolean
    options: { label: string; value: string }[]
  } => ({ isPending: false, options: [] }),
)

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { name?: string }) =>
    values?.name ? `${key}:${values.name}` : key,
}))

vi.mock("@/lib/auth/auth-client", () => ({
  authClient: { useSession: authSessionMock },
}))

vi.mock("@/features/users/provider/user-hook", () => ({
  useContactAssigneeOptionsWithStatus: (props?: unknown) =>
    contactAssigneeOptionsMock(props),
}))

vi.mock("@chatbotx.io/ui/components/ui/skeleton", () => ({
  Skeleton: () => <span data-testid="assignee-loading" />,
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
  assignedInboxTeam?: { id?: string | null; name: string | null } | null
  assignedUser?: { id?: string | null; name: string | null } | null
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
    contactAssigneeOptionsMock.mockReturnValue({
      isPending: false,
      options: [],
    })
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
    await render(
      makeConversation({
        assignedUserId: "user-1",
        assignedUser: { id: "user-1", name: "Ada Lovelace" },
      }),
    )

    expect(container.textContent).toContain(
      "assignAdmin.assignedTo:Ada Lovelace",
    )
    expect(contactAssigneeOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })

  test("renders the assigned inbox team's name", async () => {
    await render(
      makeConversation({
        assignedInboxTeamId: "team-1",
        assignedInboxTeam: { id: "team-1", name: "Support" },
      }),
    )

    expect(container.textContent).toContain("assignAdmin.assignedTo:Support")
  })

  test("shows 'assigned to me' immediately for a self-assignment with no relation object yet", async () => {
    await render(
      makeConversation({
        assignedUserId: "current-user",
        assignedUser: null,
      }),
    )

    expect(container.textContent).toContain("assignAdmin.assignedToMe")
    expect(contactAssigneeOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })

  test("falls back to the option list when the relation object is missing (fresh assignment)", async () => {
    contactAssigneeOptionsMock.mockReturnValue({
      isPending: false,
      options: [{ label: "Grace Hopper", value: "u_user-2" }],
    })

    await render(
      makeConversation({
        assignedUserId: "user-2",
        assignedUser: null,
      }),
    )

    expect(container.textContent).toContain(
      "assignAdmin.assignedTo:Grace Hopper",
    )
    expect(contactAssigneeOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    )
  })

  test("falls back to the option list when the relation object is stale after a reassignment", async () => {
    contactAssigneeOptionsMock.mockReturnValue({
      isPending: false,
      options: [{ label: "Grace Hopper", value: "u_user-2" }],
    })

    await render(
      makeConversation({
        // Reassigned from user-1 to user-2; `setAssignee` only patched the
        // id, so the relation object still points at the previous assignee.
        assignedUserId: "user-2",
        assignedUser: { id: "user-1", name: "Ada Lovelace" },
      }),
    )

    expect(container.textContent).toContain(
      "assignAdmin.assignedTo:Grace Hopper",
    )
    expect(container.textContent).not.toContain("Ada Lovelace")
  })

  test("falls back to the assign-conversation prompt when no name can be resolved", async () => {
    await render(
      makeConversation({
        assignedUserId: "user-2",
        assignedUser: null,
      }),
    )

    expect(container.textContent).toContain("assignAdmin.assignConversation")
  })

  test("shows a skeleton while resolving a missing assignee relation", async () => {
    contactAssigneeOptionsMock.mockReturnValue({
      isPending: true,
      options: [],
    })

    await render(
      makeConversation({
        assignedUserId: "user-2",
        assignedUser: null,
      }),
    )

    expect(
      container.querySelector('[data-testid="assignee-loading"]'),
    ).not.toBeNull()
    expect(container.textContent).not.toContain(
      "assignAdmin.assignConversation",
    )
  })
})
