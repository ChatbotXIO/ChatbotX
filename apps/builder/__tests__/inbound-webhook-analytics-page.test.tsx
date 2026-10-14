// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  findWebhook: vi.fn(),
  listRequests: vi.fn(),
  panel: vi.fn((_props: Record<string, unknown>) => null as unknown),
}))

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound")
  }),
}))
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  getFormatter: vi.fn(async () => ({ number: (value: number) => `#${value}` })),
}))
vi.mock("@/lib/auth/require-workspace-permission", () => ({
  requireWorkspacePermission: mocks.requirePermission,
}))
vi.mock("@/features/inbound-webhooks/queries", () => ({
  findInboundWebhookForEditor: mocks.findWebhook,
  listInboundWebhookRequests: mocks.listRequests,
}))
vi.mock(
  "@/features/inbound-webhooks/components/inbound-webhook-requests-panel",
  () => ({ InboundWebhookRequestsPanel: mocks.panel }),
)
vi.mock("@/components/app-breadcrumb", () => ({ AppBreadcrumb: () => null }))

const { ChatbotXException } = await import("@chatbotx.io/business/errors")
const { default: AnalyticsPage } = await import(
  "../src/app/space/[workspaceId]/inbound-webhooks/[id]/analytics/page"
)

const render = (params: { workspaceId: string; id: string }) =>
  AnalyticsPage({
    params: Promise.resolve(params),
    searchParams: Promise.resolve({ requestsPage: "2" }),
  })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermission.mockResolvedValue(undefined)
  mocks.findWebhook.mockResolvedValue({
    id: "5",
    name: "Orders",
    requestCount: 42,
  })
  mocks.listRequests.mockResolvedValue({ data: [], pageCount: 3 })
})

describe("inbound webhook analytics page", () => {
  test("is gated on superAdmin before anything is loaded", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("forbidden"))

    await expect(render({ workspaceId: "1", id: "5" })).rejects.toThrow(
      "forbidden",
    )
    expect(mocks.requirePermission).toHaveBeenCalledWith("1", "superAdmin")
    expect(mocks.findWebhook).not.toHaveBeenCalled()
    expect(mocks.listRequests).not.toHaveBeenCalled()
  })

  test("loads the requested page of the log for this webhook", async () => {
    await render({ workspaceId: "1", id: "5" })

    expect(mocks.listRequests).toHaveBeenCalledWith({
      workspaceId: "1",
      inboundWebhookId: "5",
      page: 2,
      perPage: 10,
    })
  })

  test("a missing or foreign webhook is a 404", async () => {
    mocks.findWebhook.mockRejectedValue(
      new ChatbotXException("Inbound webhook not found", "notFound", 404),
    )

    await expect(render({ workspaceId: "1", id: "5" })).rejects.toThrow(
      "notFound",
    )
  })

  test("any other failure propagates instead of hiding as a 404", async () => {
    mocks.listRequests.mockRejectedValue(new Error("db down"))

    await expect(render({ workspaceId: "1", id: "5" })).rejects.toThrow(
      "db down",
    )
  })

  test("a malformed id is a 404", async () => {
    await expect(render({ workspaceId: "1", id: "abc" })).rejects.toThrow(
      "notFound",
    )
    expect(mocks.requirePermission).not.toHaveBeenCalled()
  })
})
