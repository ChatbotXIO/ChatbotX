// @vitest-environment node

import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  filter: vi.fn((_props: unknown) => null),
  hasPermission: vi.fn((_permissions: unknown, _name: string) => true),
  sync: vi.fn(() => null),
  dashboard: vi.fn((_props: unknown) => null),
  resolveSections: vi.fn(async (_input: unknown) => [
    { id: "contacts" },
    { id: "posts" },
  ]),
  filterOptions: vi.fn(async () => [{ id: "inbox-1" }]),
}))

vi.mock("@chatbotx.io/business", () => ({
  inboxService: { listAnalyticsFilterOptions: mocks.filterOptions },
}))
vi.mock("@/features/analytics/components/analytics-channel-filter", () => ({
  AnalyticsChannelFilter: mocks.filter,
  AnalyticsFilterStoreSync: mocks.sync,
}))
vi.mock("@/features/analytics/lib/resolve-analytics-sections", () => ({
  resolveAnalyticsSections: mocks.resolveSections,
}))
vi.mock("@/features/inboxes/queries", () => ({
  listInboxes: async () => ({ data: [] }),
}))
vi.mock("@/features/inboxes/components/inbox-card-list", () => ({
  InboxCardList: () => null,
}))
vi.mock("@/env", () => ({ isCloud: () => false }))
vi.mock("@/lib/auth/require-password-current", () => ({
  enforcePasswordCurrent: () => undefined,
}))
vi.mock("@/lib/workspace-quota", () => ({
  getWorkspaceBlockStateForRender: async () => ({
    blocked: false,
    blockReason: null,
  }),
}))
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found")
  },
}))
vi.mock("@/lib/auth/permission-routes", () => ({
  hasWorkspacePermission: (permissions: unknown, name: string) =>
    mocks.hasPermission(permissions, name),
}))
vi.mock("@/lib/auth/utils", () => ({
  getCurrentUserAndTargetWorkspace: async () => ({
    user: {},
    targetWorkspace: { createdAt: new Date("2026-01-01"), ownerId: "o" },
    targetWorkspaceMember: { permissions: {} },
  }),
}))
vi.mock("@chatbotx.io/analytics-nextjs/components/contacts-dashboard", () => ({
  ContactsDashboard: (props: { channelFilter: ReactNode }) => {
    mocks.dashboard(props)
    return props.channelFilter
  },
}))
vi.mock(
  "@chatbotx.io/analytics-nextjs/components/conversations-dashboard",
  () => ({
    ConversationsDashboard: (props: { channelFilter: ReactNode }) => {
      mocks.dashboard(props)
      return props.channelFilter
    },
  }),
)

const { default: Layout } = await import(
  "../src/app/space/[workspaceId]/dashboard/layout"
)
const { default: ContactsPage } = await import(
  "../src/app/space/[workspaceId]/dashboard/contacts/page"
)
const { default: ConversationsPage } = await import(
  "../src/app/space/[workspaceId]/dashboard/conversations/page"
)

const params = Promise.resolve({ workspaceId: "ws-1" })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.hasPermission.mockImplementation(() => true)
})

describe("dashboard layout", () => {
  test("renders the shared filter row once, with the resolved sections and inbox options", async () => {
    renderToStaticMarkup(
      await Layout({ children: <span data-section />, params }),
    )

    expect(mocks.filter).toHaveBeenCalledTimes(1)
    expect(mocks.filter).toHaveBeenCalledWith(
      {
        canAppendUnlisted: true,
        options: [{ id: "inbox-1" }],
        sections: [{ id: "contacts" }, { id: "posts" }],
      },
      undefined,
    )
    expect(mocks.resolveSections).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      permissions: { analytics: true, superAdmin: true },
    })
  })

  test("an analytics-only member's row may not append unlisted sections", async () => {
    mocks.hasPermission.mockImplementation(
      (_permissions, name) => name === "analytics",
    )

    renderToStaticMarkup(
      await Layout({ children: <span data-section />, params }),
    )

    expect(mocks.filter).toHaveBeenCalledWith(
      expect.objectContaining({ canAppendUnlisted: false }),
      undefined,
    )
  })
})

describe.each([
  ["contacts", ContactsPage],
  ["conversations", ConversationsPage],
])("%s dashboard page", (_name, Page) => {
  test("starts from the URL selection and leaves the filter row to the layout", async () => {
    renderToStaticMarkup(
      await Page({
        params,
        searchParams: Promise.resolve({
          channels: "messenger,instagram",
          inboxIds: "7",
        }),
      }),
    )

    expect(mocks.filter).not.toHaveBeenCalled()
    expect(mocks.sync).toHaveBeenCalled()
    const props = mocks.dashboard.mock.calls[0]?.[0] as {
      initialFilters: { channels: string[]; inboxIds: string[] }
    }
    expect(props.initialFilters).toEqual({
      channels: ["messenger", "instagram"],
      inboxIds: ["7"],
    })
  })

  test("without query params the selection is All", async () => {
    renderToStaticMarkup(
      await Page({ params, searchParams: Promise.resolve({}) }),
    )

    const props = mocks.dashboard.mock.calls[0]?.[0] as {
      initialFilters: { channels: string[]; inboxIds: string[] }
    }
    expect(props.initialFilters).toEqual({ channels: [], inboxIds: [] })
  })
})
