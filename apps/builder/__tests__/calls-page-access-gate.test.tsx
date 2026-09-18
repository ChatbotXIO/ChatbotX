// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  getCurrentUserAndTargetWorkspaceMock,
  listWhatsappCallsMock,
  listCallFilterOptionsMock,
  callsPageClientMock,
} = vi.hoisted(() => ({
  getCurrentUserAndTargetWorkspaceMock: vi.fn(),
  listWhatsappCallsMock: vi.fn(),
  listCallFilterOptionsMock: vi.fn(),
  callsPageClientMock: vi.fn(
    (_props: Record<string, unknown>) => null as unknown,
  ),
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound")
  }),
}))

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: getCurrentUserAndTargetWorkspaceMock,
}))

vi.mock("@/features/whatsapp-calls/queries/list-whatsapp-calls.query", () => ({
  listWhatsappCalls: listWhatsappCallsMock,
}))

vi.mock(
  "@/features/whatsapp-calls/queries/list-call-filter-options.query",
  () => ({
    listCallFilterOptions: listCallFilterOptionsMock,
  }),
)

vi.mock("@/features/whatsapp-calls/calls-page-client", () => ({
  CallsPageClient: callsPageClientMock,
}))

vi.mock("@/features/whatsapp-calls/schema/query", () => ({
  listWhatsappCallsSearchParamsCache: {
    parse: () => ({
      activity: undefined,
      inboxId: undefined,
      agentUserId: undefined,
    }),
  },
}))

const { default: CallsPage } = await import(
  "../src/app/space/[workspaceId]/calls/page"
)

beforeEach(() => {
  vi.clearAllMocks()
  listWhatsappCallsMock.mockResolvedValue({ data: [], nextCursor: null })
  listCallFilterOptionsMock.mockResolvedValue({
    inboxOptions: [],
    agentOptions: [],
  })
})

const renderPage = () =>
  CallsPage({
    params: Promise.resolve({ workspaceId: "123" }),
    searchParams: Promise.resolve({}),
  } as never)

/**
 * Actually mounts the resolved page element so the mocked `CallsPageClient`
 * function component is INVOKED (not just referenced in the element tree) —
 * `renderPage()` alone only awaits the async server component down to its
 * returned JSX, it never calls the child component functions.
 */
const renderPageStatic = async () => {
  const element = await renderPage()
  renderToStaticMarkup(element as never)
}

describe("Calls page access gate", () => {
  test("renders for a contacts member", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: { permissions: { contacts: true } },
    })

    await expect(renderPage()).resolves.toBeDefined()
  })

  test("renders for an analytics-only member", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: { permissions: { analytics: true } },
    })

    await expect(renderPage()).resolves.toBeDefined()
  })

  test("404s (notFound) for a member with neither contacts/onlyAssignedContacts nor analytics", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: { permissions: {} },
    })

    await expect(renderPage()).rejects.toThrow("notFound")
    expect(listWhatsappCallsMock).not.toHaveBeenCalled()
  })

  test("404s (notFound) when the caller has no access to the workspace at all", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue(null)

    await expect(renderPage()).rejects.toThrow("notFound")
  })
})

// Agent select is admin-only (superAdmin || analytics); the inbox select
// and its options are fetched for everyone with page access.
describe("Calls page — filter options + admin gating", () => {
  test("fetches filter options with includeAgents=true and passes showAgentFilter=true for a superAdmin", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: { permissions: { superAdmin: true } },
    })

    await renderPageStatic()

    expect(listCallFilterOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ includeAgents: true }),
    )
    expect(callsPageClientMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ showAgentFilter: true }),
    )
  })

  test("fetches filter options with includeAgents=true and passes showAgentFilter=true for analytics-only", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: { permissions: { analytics: true } },
    })

    await renderPageStatic()

    expect(listCallFilterOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ includeAgents: true }),
    )
    expect(callsPageClientMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ showAgentFilter: true }),
    )
  })

  test("fetches filter options with includeAgents=false and passes showAgentFilter=false for a contacts-only member", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: { permissions: { contacts: true } },
    })

    await renderPageStatic()

    expect(listCallFilterOptionsMock).toHaveBeenCalledWith(
      expect.objectContaining({ includeAgents: false }),
    )
    expect(callsPageClientMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ showAgentFilter: false }),
    )
  })

  test("passes the resolved inbox/agent options and current filter values through to CallsPageClient", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: { permissions: { superAdmin: true } },
    })
    listCallFilterOptionsMock.mockResolvedValue({
      inboxOptions: [{ id: "inbox-1", name: "Support" }],
      agentOptions: [{ id: "agent-1", name: "Alice" }],
    })

    await renderPageStatic()

    expect(callsPageClientMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        inboxOptions: [{ id: "inbox-1", name: "Support" }],
        agentOptions: [{ id: "agent-1", name: "Alice" }],
      }),
    )
  })
})
