// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

// B-H1 (Fable review): `?inboxId=abc` / `?agentUserId=abc` used to crash the
// page with an unhandled RSC 500 — `inboxIdQueryParser`/`agentUserIdQueryParser`
// were plain `parseAsString`, so a non-numeric value reached
// `whatsappCallHistoryService.list` unvalidated and Postgres rejected it as
// bigint input (22P02). Deliberately does NOT mock
// `@/features/whatsapp-calls/schema/query` — the OTHER Calls-page test file
// (`calls-page-access-gate.test.tsx`) stubs the whole search-params cache, so
// a regression in the real parser would pass there even though the page
// crashes for a real request. This file exercises the REAL
// `listWhatsappCallsSearchParamsCache`.

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
  getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
    user: { id: "user-1" },
    targetWorkspaceMember: { permissions: { superAdmin: true } },
  })
})

const renderPageStatic = async (
  searchParams: Record<string, string | string[] | undefined>,
) => {
  const element = await CallsPage({
    params: Promise.resolve({ workspaceId: "123" }),
    searchParams: Promise.resolve(searchParams),
  } as never)
  renderToStaticMarkup(element as never)
}

describe("Calls page — non-numeric inboxId/agentUserId (B-H1)", () => {
  test("a non-numeric inboxId does not crash the page and forwards inboxId: undefined", async () => {
    await expect(renderPageStatic({ inboxId: "abc" })).resolves.toBeUndefined()

    expect(listWhatsappCallsMock).toHaveBeenCalledWith(
      expect.objectContaining({ inboxId: undefined }),
      expect.anything(),
    )
    expect(callsPageClientMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ inboxId: undefined }),
    )
  })

  test("a non-numeric agentUserId does not crash the page and forwards agentUserId: undefined", async () => {
    await expect(
      renderPageStatic({ agentUserId: "not-a-number" }),
    ).resolves.toBeUndefined()

    expect(listWhatsappCallsMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentUserId: undefined }),
      expect.anything(),
    )
  })

  test("a valid numeric inboxId still forwards through to the service", async () => {
    await renderPageStatic({ inboxId: "42" })

    expect(listWhatsappCallsMock).toHaveBeenCalledWith(
      expect.objectContaining({ inboxId: "42" }),
      expect.anything(),
    )
  })

  test("a valid numeric agentUserId still forwards through to the service", async () => {
    await renderPageStatic({ agentUserId: "77" })

    expect(listWhatsappCallsMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentUserId: "77" }),
      expect.anything(),
    )
  })
})

// B-L1 (Fable review): the agent filter is admin-only (D4:
// `isCallHistoryAdmin`). A non-admin who still has `?agentUserId=…` in the
// URL (stale link, tampered param) must have it dropped for BOTH the
// service call and the client props — otherwise `hasActiveFilter`/"Load
// more" would treat an ignored filter as active.
describe("Calls page — agentUserId is admin-only (B-L1)", () => {
  test("drops a valid agentUserId for a non-admin (contacts-only) member", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: { permissions: { contacts: true } },
    })

    await renderPageStatic({ agentUserId: "77" })

    expect(listWhatsappCallsMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentUserId: undefined }),
      expect.anything(),
    )
    expect(callsPageClientMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ agentUserId: undefined }),
    )
  })

  test("keeps a valid agentUserId for an admin (superAdmin) member", async () => {
    getCurrentUserAndTargetWorkspaceMock.mockResolvedValue({
      user: { id: "user-1" },
      targetWorkspaceMember: { permissions: { superAdmin: true } },
    })

    await renderPageStatic({ agentUserId: "77" })

    expect(listWhatsappCallsMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentUserId: "77" }),
      expect.anything(),
    )
    expect(callsPageClientMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ agentUserId: "77" }),
    )
  })
})
